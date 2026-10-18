<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import type { PoseDefinition } from '@/poses'
import { detectImage, detectVideo, loadDetector } from '@/pose/detector'
import { FeedbackEngine, type Feedback } from '@/pose/engine'
import { VoiceCoach, speak } from '@/pose/coach'
import { drawSkeleton, jointStatuses } from '@/pose/draw'
import type { PoseFrame } from '@/pose/landmarks'
import FeedbackPanel from './FeedbackPanel.vue'

const props = defineProps<{ pose: PoseDefinition }>()
defineEmits<{ back: [] }>()

type Source = 'none' | 'camera' | 'photo'

const source = ref<Source>('none')
const loading = ref(false)
const error = ref('')
const feedback = shallowRef<Feedback | null>(null)
const voiceOn = ref(true)
const mirror = ref(true)
const photoUrl = ref('')

const video = ref<HTMLVideoElement>()
const photo = ref<HTMLImageElement>()
const canvas = ref<HTMLCanvasElement>()

let stream: MediaStream | null = null
let rafId = 0
let running = false
let engine = new FeedbackEngine(props.pose)
let coach = new VoiceCoach()

const mirrored = computed(() => source.value === 'camera' && mirror.value)

async function startCamera() {
  stop()
  error.value = ''
  loading.value = true
  try {
    // Speaking inside the click handler unlocks speech on mobile browsers.
    if (voiceOn.value) speak(`Let's practise ${props.pose.name.split(' (')[0]}.`)
    const [media] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
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
    loop()
  } catch (e) {
    error.value = describeError(e)
    stop()
  } finally {
    loading.value = false
  }
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

function stop() {
  running = false
  cancelAnimationFrame(rafId)
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  lastVideoTime = -1
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (source.value === 'camera') {
    source.value = 'none'
    feedback.value = null
  }
}

function toggleVoice() {
  voiceOn.value = !voiceOn.value
  if (!voiceOn.value && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

function describeError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in your browser and try again.'
  if (name === 'NotFoundError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is in use by another app.'
  return `Something went wrong: ${(e as Error)?.message ?? e}`
}

onBeforeUnmount(() => {
  stop()
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
})
</script>

<template>
  <section class="practice">
    <div class="topbar">
      <button class="ghost" @click="$emit('back')">← All positions</button>
      <h2>{{ pose.emoji }} {{ pose.name }}</h2>
    </div>

    <div class="layout">
      <div class="stage-col">
        <div class="stage" :class="{ empty: source === 'none', mirrored }">
          <video v-if="source === 'camera'" ref="video" playsinline muted />
          <img v-if="source === 'photo'" ref="photo" :src="photoUrl" alt="Your uploaded photo" />
          <canvas v-show="source !== 'none'" ref="canvas" />

          <div v-if="source === 'none'" class="setup">
            <p class="tip"><strong>Camera setup:</strong> {{ pose.cameraTip }}</p>
            <ul>
              <li v-for="cue in pose.cues" :key="cue">{{ cue }}</li>
            </ul>
          </div>
          <div v-if="loading" class="loading">Loading pose model…</div>
        </div>

        <div class="controls">
          <button v-if="source !== 'camera'" class="primary" :disabled="loading" @click="startCamera">
            Start camera
          </button>
          <button v-else class="primary" @click="stop">Stop camera</button>
          <label class="button ghost">
            Analyse a photo
            <input type="file" accept="image/*" hidden @change="onPhoto" />
          </label>
          <button class="ghost" :aria-pressed="voiceOn" @click="toggleVoice">
            {{ voiceOn ? '🔊 Voice on' : '🔇 Voice off' }}
          </button>
          <button v-if="source === 'camera'" class="ghost" :aria-pressed="mirror" @click="mirror = !mirror">
            Mirror {{ mirror ? 'on' : 'off' }}
          </button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <aside class="side">
        <FeedbackPanel v-if="source !== 'none'" :feedback="feedback" :live="source === 'camera'" />
        <div v-else class="about">
          <p>{{ pose.summary }}</p>
          <p class="muted">
            Start the camera and get into position. Joints turn
            <span class="g">green</span> when they're right and <span class="r">red</span> when they need
            a correction, and the most important fix is read aloud.
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
  display: grid;
}
.stage > video,
.stage > img,
.stage > canvas {
  grid-area: 1 / 1;
  width: 100%;
  height: auto;
  display: block;
  max-height: 75vh;
  object-fit: contain;
}
.stage.mirrored > video,
.stage.mirrored > canvas {
  transform: scaleX(-1);
}
.stage.empty {
  background: var(--surface);
  border: 1px dashed var(--border);
  min-height: 300px;
}
.setup {
  grid-area: 1 / 1;
  padding: 1.5rem;
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
</style>
