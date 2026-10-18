<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { describeCameraError as describeError, useCamera } from '@/composables/useCamera'
import type { CheckStatus } from '@/poses'
import type { MovementFeedback, MovementTracker } from '@/movements'
import { isMovement, type Exercise } from '@/exercises'
import { detectImage, detectVideo, loadDetector } from '@/pose/detector'
import { FeedbackEngine, type Feedback } from '@/pose/engine'
import { MovementVoice, VoiceCoach } from '@/pose/coach'
import { saveVoiceName, savedVoiceName, speak, stopSpeaking, watchVoices } from '@/pose/voice'
import { drawSkeleton, jointStatuses } from '@/pose/draw'
import { headline } from '@/pose/banner'
import type { PoseFrame } from '@/pose/landmarks'
import FeedbackPanel from './FeedbackPanel.vue'
import MovementPanel from './MovementPanel.vue'
import PoseFigure from './PoseFigure.vue'

const props = defineProps<{ exercise: Exercise }>()
defineEmits<{ back: [] }>()

/** camera: live; clip: an uploaded video; photo: a single uploaded image. */
type Source = 'none' | 'camera' | 'clip' | 'photo'

const movement = isMovement(props.exercise) ? props.exercise : null
const pose = isMovement(props.exercise) ? null : props.exercise

const source = ref<Source>('none')
const loading = ref(false)
const error = ref('')
const feedback = shallowRef<Feedback | null>(null)
const moveFeedback = shallowRef<MovementFeedback | null>(null)
const clipEnded = ref(false)
const voiceOn = ref(true)
const mediaUrl = ref('')
const voices = shallowRef<SpeechSynthesisVoice[]>([])
const voiceName = ref(savedVoiceName() ?? '')

const video = ref<HTMLVideoElement>()
const photo = ref<HTMLImageElement>()
const canvas = ref<HTMLCanvasElement>()

const camera = useCamera(video)
const { mirror } = camera
let rafId = 0
let running = false
let engine: FeedbackEngine | null = null
let tracker: MovementTracker | null = null
let coach = new VoiceCoach()
let moveVoice = new MovementVoice()

const live = computed(() => source.value === 'camera')
const playing = computed(() => source.value === 'camera' || source.value === 'clip')
const mirrored = computed(() => live.value && mirror.value)
const banner = computed(() => {
  if (movement) return moveFeedback.value?.headline ?? { tone: 'info' as const, text: 'Waiting for the camera…' }
  return headline(feedback.value, playing.value)
})
const highlight = computed<Map<number, CheckStatus>>(() => {
  const issue = feedback.value?.topIssue
  if (!issue) return new Map()
  // You may be using the opposite side from the drawing, so mark the joint on both sides.
  // Left/right landmark pairs are adjacent indices (odd = left, even = right).
  const both = issue.joints.flatMap((j) => (j === 0 ? [j] : [j, j % 2 ? j + 1 : j - 1]))
  return new Map(both.map((j) => [j, issue.status]))
})
const chips = computed(() => {
  if (movement) {
    const reps = moveFeedback.value?.reps ?? []
    if (!reps.length) return []
    const plural = reps.length === 1 ? '' : 's'
    return [`${reps.length} ${movement.unit}${plural}`, `${reps.filter((r) => r.ok).length} clean`]
  }
  const fb = feedback.value
  if (!playing.value || fb?.phase !== 'checking') return []
  return [`${fb.score}% form`, `⏱ ${fb.holdSeconds.toFixed(1)}s`]
})

const stopWatchingVoices = watchVoices((list) => {
  voices.value = list
  if (!list.some((v) => v.name === voiceName.value)) voiceName.value = list[0]?.name ?? ''
})

function chooseVoice(name: string) {
  voiceName.value = name
  saveVoiceName(name)
  if (voiceOn.value) speak('This is how I will sound.')
}

function resetAnalysis() {
  engine = pose ? new FeedbackEngine(pose) : null
  tracker = movement ? movement.createTracker() : null
  coach = new VoiceCoach()
  moveVoice = new MovementVoice()
  feedback.value = null
  moveFeedback.value = null
}

async function startCamera() {
  stop()
  error.value = ''
  loading.value = true
  try {
    // Speaking inside the click handler unlocks speech on mobile browsers.
    if (voiceOn.value) speak(`Let's practise ${props.exercise.name.split(' (')[0]}.`)
    source.value = 'camera'
    await nextTick()
    await Promise.all([camera.start(), loadDetector()])
    resetAnalysis()
    running = true
    loop()
  } catch (e) {
    error.value = describeError(e)
    stop()
  } finally {
    loading.value = false
  }
}

async function switchCamera() {
  running = false
  try {
    await camera.switchCamera()
    running = true
    loop()
  } catch (e) {
    error.value = describeError(e)
    stop()
  }
}

let lastVideoTime = -1
async function loop() {
  if (!running) return
  const v = video.value
  if (v && source.value === 'clip' && v.ended) {
    running = false
    clipEnded.value = true
    return
  }
  if (v && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
    lastVideoTime = v.currentTime
    const now = performance.now()
    // Uploaded clips are judged on their own clock so slow playback doesn't distort timing.
    const t = source.value === 'clip' ? v.currentTime * 1000 : now
    try {
      const frame = await detectVideo(v, now)
      if (!running) return
      analyse(frame, t, v.videoWidth, v.videoHeight)
    } catch (e) {
      error.value = describeError(e)
      stop()
      return
    }
  }
  rafId = requestAnimationFrame(loop)
}

function analyse(frame: PoseFrame | null, t: number, width: number, height: number) {
  let joints: Map<number, CheckStatus>
  let line: string | null
  if (tracker) {
    const fb = tracker.update(frame, t)
    moveFeedback.value = fb
    joints = fb.joints
    line = moveVoice.next(fb, t)
  } else {
    const fb = engine!.update(frame, t)
    feedback.value = fb
    joints = fb.phase === 'checking' ? jointStatuses(fb.checks) : new Map()
    line = coach.next(fb, t)
  }
  draw(frame, joints, width, height)
  if (line && voiceOn.value) speak(line)
}

async function onPhoto(event: Event) {
  const file = takeFile(event)
  if (!file || !pose) return
  stop()
  error.value = ''
  loading.value = true
  try {
    setMedia(file)
    source.value = 'photo'
    await nextTick()
    const img = photo.value!
    await img.decode()
    const frame = await detectImage(img)
    const fb = new FeedbackEngine(pose, { debounceMs: 0, smoothing: 1 }).update(frame, 0)
    if (!frame) fb.hint = "Couldn't find a person in this photo. Try one with your whole body visible."
    feedback.value = fb
    draw(frame, fb.phase === 'checking' ? jointStatuses(fb.checks) : new Map(), img.naturalWidth, img.naturalHeight)
  } catch (e) {
    error.value = describeError(e)
  } finally {
    loading.value = false
  }
}

async function onClip(event: Event) {
  const file = takeFile(event)
  if (!file) return
  stop()
  error.value = ''
  loading.value = true
  try {
    if (voiceOn.value) speak('Analysing your video.')
    await loadDetector()
    setMedia(file)
    source.value = 'clip'
    await nextTick()
    await playClip()
  } catch (e) {
    error.value = describeError(e)
    stop()
  } finally {
    loading.value = false
  }
}

async function playClip() {
  const v = video.value!
  v.src = mediaUrl.value
  // Half speed gives the pose model more frames of fast movements like turns.
  v.playbackRate = 0.5
  v.currentTime = 0
  clipEnded.value = false
  resetAnalysis()
  await v.play()
  running = true
  loop()
}

function takeFile(event: Event): File | undefined {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  return file
}

function setMedia(file: File) {
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value)
  mediaUrl.value = URL.createObjectURL(file)
}

function draw(frame: PoseFrame | null, joints: Map<number, CheckStatus>, width: number, height: number) {
  const c = canvas.value
  if (!c) return
  if (c.width !== width || c.height !== height) {
    c.width = width
    c.height = height
  }
  drawSkeleton(c.getContext('2d')!, frame?.image ?? null, joints)
}

function stop() {
  running = false
  cancelAnimationFrame(rafId)
  camera.stop()
  video.value?.pause()
  lastVideoTime = -1
  stopSpeaking()
  if (source.value === 'camera') {
    source.value = 'none'
    feedback.value = null
    moveFeedback.value = null
  }
}

function resetCount() {
  tracker = movement ? movement.createTracker() : null
  moveVoice = new MovementVoice()
  moveFeedback.value = null
}

function toggleVoice() {
  voiceOn.value = !voiceOn.value
  if (!voiceOn.value) stopSpeaking()
}

onBeforeUnmount(() => {
  stop()
  stopWatchingVoices()
  if (mediaUrl.value) URL.revokeObjectURL(mediaUrl.value)
})
</script>

<template>
  <section class="practice">
    <div class="topbar">
      <button class="ghost" @click="$emit('back')">← All exercises</button>
      <h2>{{ exercise.name }}</h2>
    </div>

    <div class="layout">
      <div class="stage-col">
        <div class="stage" :class="{ empty: source === 'none', live }">
          <template v-if="source !== 'none'">
            <div class="media" :class="{ mirrored }">
              <video v-if="playing" ref="video" playsinline muted />
              <img v-if="source === 'photo'" ref="photo" :src="mediaUrl" alt="Your uploaded photo" />
              <canvas ref="canvas" />
            </div>

            <div class="hud">
              <div class="headline" :class="banner.tone" role="status" aria-live="polite">{{ banner.text }}</div>
              <div class="thumb" aria-hidden="true">
                <PoseFigure :illustration="exercise.illustration" :highlight="highlight" />
              </div>
              <div v-if="chips.length" class="chips">
                <span v-for="c in chips" :key="c" class="chip">{{ c }}</span>
              </div>
            </div>
          </template>

          <div v-else class="setup">
            <div class="setup-figure">
              <PoseFigure :illustration="exercise.illustration" :title="`Illustration of ${exercise.name}`" />
            </div>
            <div class="setup-text">
              <p class="tip"><strong>Camera setup:</strong> {{ exercise.cameraTip }}</p>
              <ul>
                <li v-for="cue in exercise.cues" :key="cue">{{ cue }}</li>
              </ul>
            </div>
          </div>
          <div v-if="loading" class="loading">Loading pose model…</div>
        </div>

        <div class="controls">
          <button v-if="!live" class="primary" :disabled="loading" @click="startCamera">Start camera</button>
          <button v-else class="primary" @click="stop">Stop</button>
          <button v-if="live" class="ghost" @click="switchCamera">🔄 Switch camera</button>
          <button v-if="source === 'clip' && clipEnded" class="ghost" @click="playClip">↺ Replay video</button>
          <label class="button ghost">
            Analyse a video
            <input type="file" accept="video/*" hidden @change="onClip" />
          </label>
          <label v-if="pose" class="button ghost">
            Analyse a photo
            <input type="file" accept="image/*" hidden @change="onPhoto" />
          </label>
          <button class="ghost" :aria-pressed="voiceOn" @click="toggleVoice">
            {{ voiceOn ? '🔊 Voice on' : '🔇 Voice off' }}
          </button>
          <button v-if="live" class="ghost" :aria-pressed="mirror" @click="mirror = !mirror">
            Mirror {{ mirror ? 'on' : 'off' }}
          </button>
          <label v-if="voiceOn && voices.length > 1" class="voice-select">
            <span>Voice</span>
            <select :value="voiceName" @change="chooseVoice(($event.target as HTMLSelectElement).value)">
              <option v-for="v in voices" :key="v.name" :value="v.name">{{ v.name }} ({{ v.lang }})</option>
            </select>
          </label>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <aside class="side">
        <template v-if="source !== 'none'">
          <MovementPanel v-if="movement" :feedback="moveFeedback" :unit="movement.unit" @reset="resetCount" />
          <FeedbackPanel v-else :feedback="feedback" :live="playing" />
        </template>
        <div v-else class="about">
          <p>{{ exercise.summary }}</p>
          <p v-if="movement" class="muted">
            Start the camera and go. Each {{ movement.unit }} is counted and checked as you do it, and the result is read
            aloud. You can also film yourself (slow motion helps with fast movements) and use <em>Analyse a video</em>.
          </p>
          <p v-else class="muted">
            Start the camera and get into position. Joints turn <span class="g">green</span> when they're right and
            <span class="r">red</span> when they need a correction, and the most important fix is read aloud.
          </p>
          <p class="muted">
            On a phone, prop it up against something so it can see your whole body. The back camera is usually
            sharper: use <em>Switch camera</em> once it's running.
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
h2 {
  margin: 0;
  font-size: 1.4rem;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 1.5rem;
  align-items: start;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.stage {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  background: #000;
}
.media {
  display: grid;
  place-items: center;
}
.media > video,
.media > img,
.media > canvas {
  grid-area: 1 / 1;
  width: 100%;
  height: auto;
  display: block;
  max-height: 75vh;
  object-fit: contain;
}
.media.mirrored {
  transform: scaleX(-1);
}

/* Overlay so feedback is readable from a few metres away. */
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto 1fr auto;
  gap: 0.5rem;
  padding: 0.6rem;
}
.headline {
  grid-column: 1;
  align-self: start;
  padding: 0.6rem 0.85rem;
  border-radius: 12px;
  font-size: clamp(1rem, 3.6vw, 1.6rem);
  font-weight: 700;
  line-height: 1.25;
  color: #fff;
  background: rgb(15 15 20 / 0.72);
  border-left: 6px solid #93c5fd;
  backdrop-filter: blur(4px);
}
.headline.good {
  border-left-color: #34d399;
}
.headline.warn {
  border-left-color: #fbbf24;
}
.headline.bad {
  border-left-color: #f87171;
}
.thumb {
  grid-column: 2;
  grid-row: 1 / 3;
  width: clamp(64px, 16vw, 120px);
  aspect-ratio: 1;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface);
  opacity: 0.92;
}
.chips {
  grid-column: 1 / -1;
  grid-row: 3;
  display: flex;
  gap: 0.4rem;
}
.chip {
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: rgb(15 15 20 / 0.72);
  color: #fff;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stage.empty {
  background: var(--surface);
  border: 1px dashed var(--border);
}
.setup {
  display: grid;
  grid-template-columns: minmax(140px, 220px) 1fr;
  gap: 1.25rem;
  align-items: center;
  padding: 1.25rem;
}
@media (max-width: 560px) {
  .setup {
    grid-template-columns: 1fr;
  }
  .setup-figure {
    max-width: 220px;
    margin: 0 auto;
  }
}
.setup-figure {
  aspect-ratio: 1;
}
.setup ul {
  color: var(--muted);
  padding-left: 1.2rem;
  margin: 0.75rem 0 0;
  line-height: 1.7;
}
.tip {
  margin: 0;
}
.loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 0.55);
  color: #fff;
  font-weight: 600;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.voice-select {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.voice-select select {
  font: inherit;
  max-width: 14rem;
  min-height: 44px;
  padding: 0 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.error {
  color: var(--bad);
}
.about p {
  margin-top: 0;
}
.muted {
  color: var(--muted);
}
.g {
  color: var(--good);
  font-weight: 600;
}
.r {
  color: var(--bad);
  font-weight: 600;
}

/* Phones: while the camera runs, give the video the whole screen width and most of its height. */
@media (max-width: 700px) {
  .topbar {
    margin-bottom: 0.5rem;
  }
  h2 {
    font-size: 1.15rem;
  }
  .stage {
    margin: 0 -16px;
    border-radius: 0;
  }
  .stage.empty {
    margin: 0;
    border-radius: 18px;
  }
  .stage.live .media > video,
  .stage.live .media > canvas {
    max-height: calc(100svh - 150px);
  }
  .controls button,
  .controls .button {
    flex: 1 1 auto;
  }
}
</style>
