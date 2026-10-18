<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { CheckStatus, PoseDefinition } from '@/poses'
import { detectImage, detectVideo, loadDetector } from '@/pose/detector'
import { FeedbackEngine, type Feedback } from '@/pose/engine'
import { VoiceCoach } from '@/pose/coach'
import { saveVoiceName, savedVoiceName, speak, stopSpeaking, watchVoices } from '@/pose/voice'
import { drawSkeleton, jointStatuses } from '@/pose/draw'
import { headline } from '@/pose/banner'
import type { PoseFrame } from '@/pose/landmarks'
import FeedbackPanel from './FeedbackPanel.vue'
import PoseFigure from './PoseFigure.vue'

const props = defineProps<{ pose: PoseDefinition }>()
defineEmits<{ back: [] }>()

type Source = 'none' | 'camera' | 'photo'
type Facing = 'user' | 'environment'

const source = ref<Source>('none')
const loading = ref(false)
const error = ref('')
const feedback = shallowRef<Feedback | null>(null)
const voiceOn = ref(true)
const facing = ref<Facing>('user')
const mirror = ref(true)
const photoUrl = ref('')
const voices = shallowRef<SpeechSynthesisVoice[]>([])
const voiceName = ref(savedVoiceName() ?? '')

const video = ref<HTMLVideoElement>()
const photo = ref<HTMLImageElement>()
const canvas = ref<HTMLCanvasElement>()

let stream: MediaStream | null = null
let wakeLock: WakeLockSentinel | null = null
let rafId = 0
let running = false
let engine = new FeedbackEngine(props.pose)
let coach = new VoiceCoach()

const live = computed(() => source.value === 'camera')
const mirrored = computed(() => live.value && mirror.value)
const banner = computed(() => headline(feedback.value, live.value))
const highlight = computed<Map<number, CheckStatus>>(() => {
  const issue = feedback.value?.topIssue
  if (!issue) return new Map()
  // You may be using the opposite side from the drawing, so mark the joint on both sides.
  // Left/right landmark pairs are adjacent indices (odd = left, even = right).
  const both = issue.joints.flatMap((j) => (j === 0 ? [j] : [j, j % 2 ? j + 1 : j - 1]))
  return new Map(both.map((j) => [j, issue.status]))
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

async function startCamera() {
  stop()
  error.value = ''
  loading.value = true
  try {
    // Speaking inside the click handler unlocks speech on mobile browsers.
    if (voiceOn.value) speak(`Let's practise ${props.pose.name.split(' (')[0]}.`)
    const [media] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing.value }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }),
      loadDetector(),
    ])
    stream = media
    source.value = 'camera'
    await nextTick()
    const v = video.value!
    v.srcObject = stream
    await v.play()
    engine = new FeedbackEngine(props.pose)
    coach = new VoiceCoach()
    running = true
    keepAwake()
    loop()
  } catch (e) {
    error.value = describeError(e)
    stop()
  } finally {
    loading.value = false
  }
}

async function switchCamera() {
  facing.value = facing.value === 'user' ? 'environment' : 'user'
  // The selfie camera feels natural mirrored; the back camera should not be.
  mirror.value = facing.value === 'user'
  await startCamera()
}

let lastVideoTime = -1
async function loop() {
  if (!running) return
  const v = video.value
  if (v && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
    lastVideoTime = v.currentTime
    const now = performance.now()
    try {
      const frame = await detectVideo(v, now)
      if (!running) return
      render(frame, engine.update(frame, now), v.videoWidth, v.videoHeight)
      const line = coach.next(feedback.value!, now)
      if (line && voiceOn.value) speak(line)
    } catch (e) {
      error.value = describeError(e)
      stop()
      return
    }
  }
  rafId = requestAnimationFrame(loop)
}

async function onPhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  stop()
  error.value = ''
  loading.value = true
  try {
    if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
    photoUrl.value = URL.createObjectURL(file)
    source.value = 'photo'
    await nextTick()
    const img = photo.value!
    await img.decode()
    const frame = await detectImage(img)
    const fb = new FeedbackEngine(props.pose, { debounceMs: 0, smoothing: 1 }).update(frame, 0)
    if (!frame) fb.hint = "Couldn't find a person in this photo. Try one with your whole body visible."
    render(frame, fb, img.naturalWidth, img.naturalHeight)
  } catch (e) {
    error.value = describeError(e)
  } finally {
    loading.value = false
  }
}

function render(frame: PoseFrame | null, fb: Feedback, width: number, height: number) {
  feedback.value = fb
  const c = canvas.value
  if (!c) return
  if (c.width !== width || c.height !== height) {
    c.width = width
    c.height = height
  }
  const joints = fb.phase === 'checking' ? jointStatuses(fb.checks) : new Map()
  drawSkeleton(c.getContext('2d')!, frame?.image ?? null, joints)
}

/** Stop the phone screen from dimming mid-pose. */
async function keepAwake() {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
  } catch {
    wakeLock = null // Not supported or denied: not essential.
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible' && running) keepAwake()
}

function stop() {
  running = false
  cancelAnimationFrame(rafId)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  lastVideoTime = -1
  wakeLock?.release().catch(() => {})
  wakeLock = null
  stopSpeaking()
  if (source.value === 'camera') {
    source.value = 'none'
    feedback.value = null
  }
}

function toggleVoice() {
  voiceOn.value = !voiceOn.value
  if (!voiceOn.value) stopSpeaking()
}

function describeError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in your browser and try again.'
  if (name === 'NotFoundError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is in use by another app.'
  if (!window.isSecureContext) return 'The camera only works over HTTPS (or on localhost).'
  return `Something went wrong: ${(e as Error)?.message ?? e}`
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => {
  stop()
  stopWatchingVoices()
  document.removeEventListener('visibilitychange', onVisibility)
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
})
</script>

<template>
  <section class="practice">
    <div class="topbar">
      <button class="ghost" @click="$emit('back')">← All positions</button>
      <h2>{{ pose.name }}</h2>
    </div>

    <div class="layout">
      <div class="stage-col">
        <div class="stage" :class="{ empty: source === 'none', live }">
          <template v-if="source !== 'none'">
            <div class="media" :class="{ mirrored }">
              <video v-if="source === 'camera'" ref="video" playsinline muted />
              <img v-if="source === 'photo'" ref="photo" :src="photoUrl" alt="Your uploaded photo" />
              <canvas ref="canvas" />
            </div>

            <div class="hud">
              <div class="headline" :class="banner.tone" role="status" aria-live="polite">{{ banner.text }}</div>
              <div class="thumb" aria-hidden="true">
                <PoseFigure :illustration="pose.illustration" :highlight="highlight" />
              </div>
              <div v-if="live && feedback?.phase === 'checking'" class="chips">
                <span class="chip">{{ feedback.score }}% form</span>
                <span class="chip">⏱ {{ feedback.holdSeconds.toFixed(1) }}s</span>
              </div>
            </div>
          </template>

          <div v-else class="setup">
            <div class="setup-figure">
              <PoseFigure :illustration="pose.illustration" :title="`Illustration of ${pose.name}`" />
            </div>
            <div class="setup-text">
              <p class="tip"><strong>Camera setup:</strong> {{ pose.cameraTip }}</p>
              <ul>
                <li v-for="cue in pose.cues" :key="cue">{{ cue }}</li>
              </ul>
            </div>
          </div>
          <div v-if="loading" class="loading">Loading pose model…</div>
        </div>

        <div class="controls">
          <button v-if="!live" class="primary" :disabled="loading" @click="startCamera">Start camera</button>
          <button v-else class="primary" @click="stop">Stop</button>
          <button v-if="live" class="ghost" @click="switchCamera">🔄 Switch camera</button>
          <label class="button ghost">
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
        <FeedbackPanel v-if="source !== 'none'" :feedback="feedback" :live="live" />
        <div v-else class="about">
          <p>{{ pose.summary }}</p>
          <p class="muted">
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
