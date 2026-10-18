<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { describeCameraError, useCamera } from '@/composables/useCamera'
import { detectVideo, loadDetector } from '@/pose/detector'
import { drawGhost, drawSkeleton } from '@/pose/draw'
import { speak, stopSpeaking } from '@/pose/voice'
import { ghostPose, limbStatuses } from '@/tutorial/compare'
import { AttemptScorer, stars, type AttemptResult } from '@/tutorial/scoring'
import { formatTime, poseAt, type Section } from '@/tutorial/track'
import { FilePlayer, YouTubePlayer, type TeacherPlayer } from '@/tutorial/player'
import { MASTERED, getTutorial, getVideo, isMastered, recordScore, saveTutorial, type Tutorial } from '@/tutorial/library'

const props = defineProps<{ id: string }>()
defineEmits<{ back: [] }>()

type Mode = 'watch' | 'follow' | 'memory'
type Phase = 'idle' | 'countdown' | 'running' | 'result'

const tutorial = shallowRef<Tutorial | null>(null)
const loadError = ref('')
const sectionIdx = ref(0)
const runThrough = ref(false)
const mode = ref<Mode>('watch')
const speed = ref(0.75)
const phase = ref<Phase>('idle')
const count = ref(0)
const voiceOn = ref(true)
const skeleton = ref(false)
const liveScore = ref<number | null>(null)
const liveHint = ref('')
const result = shallowRef<AttemptResult | null>(null)
const resultMode = ref<Mode>('follow')
/** A short stretch to loop in Watch mode (e.g. the weakest moment of the last attempt). */
const focus = ref<Section | null>(null)
const error = ref('')

const teacherVideo = ref<HTMLVideoElement>()
const ytBox = ref<HTMLElement>()
const teacherCanvas = ref<HTMLCanvasElement>()
const camVideo = ref<HTMLVideoElement>()
const camCanvas = ref<HTMLCanvasElement>()
const camera = useCamera(camVideo)

let player: TeacherPlayer | null = null
let videoUrl = ''
let rafId = 0
let scorer: AttemptScorer | null = null
let lowSince: number | null = null
let lastSpoken = { text: '', at: 0 }
let countdownTimer = 0

const sections = computed(() => tutorial.value?.sections ?? [])
const range = computed<Section | null>(() => {
  if (focus.value) return focus.value
  const s = sections.value
  if (!s.length) return null
  const current = s[sectionIdx.value]!
  return runThrough.value ? { start: s[0]!.start, end: current.end } : current
})
const isYouTube = computed(() => tutorial.value?.source.kind === 'youtube')
const learnedCount = computed(() => sections.value.filter((_, i) => tutorial.value && isMastered(tutorial.value, i)).length)

onMounted(async () => {
  try {
    const t = await getTutorial(props.id)
    if (!t) throw new Error('This tutorial could not be found on this device.')
    tutorial.value = t
    // Start at the first section not yet learned.
    const next = t.sections.findIndex((_, i) => !isMastered(t, i))
    sectionIdx.value = next < 0 ? 0 : next
    await nextTick()
    if (t.source.kind === 'youtube') {
      player = await YouTubePlayer.create(ytBox.value!, t.source.videoId)
    } else {
      const blob = await getVideo(t.id)
      if (!blob) throw new Error('The video for this tutorial is missing. Delete it and add it again.')
      videoUrl = URL.createObjectURL(blob)
      teacherVideo.value!.src = videoUrl
      player = new FilePlayer(teacherVideo.value!)
    }
    player.seek(range.value?.start ?? 0)
    loop()
  } catch (e) {
    loadError.value = (e as Error).message
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  clearTimeout(countdownTimer)
  stopSpeaking()
  player?.destroy()
  if (videoUrl) URL.revokeObjectURL(videoUrl)
})

// --- Choosing what to practise ----------------------------------------------------

function selectSection(i: number) {
  stopAttempt()
  focus.value = null
  sectionIdx.value = i
  player?.pause()
  player?.seek(range.value!.start)
}

function setMode(m: Mode) {
  stopAttempt()
  focus.value = null
  mode.value = m
  player?.pause()
  player?.seek(range.value?.start ?? 0)
  if (m === 'watch') camera.stop()
}

function toggleRunThrough() {
  runThrough.value = !runThrough.value
  selectSection(sectionIdx.value)
}

async function toggleFlip() {
  const t = tutorial.value
  if (!t) return
  tutorial.value = { ...t, flipped: !t.flipped }
  await saveTutorial(tutorial.value)
}

// --- Watching ----------------------------------------------------------------------

async function playWatch() {
  if (!player || !range.value) return
  player.setRate(speed.value)
  player.setMuted(false)
  if (player.time() < range.value.start || player.time() >= range.value.end - 0.05) player.seek(range.value.start)
  await player.play()
  phase.value = 'running'
}

function pauseWatch() {
  player?.pause()
  phase.value = 'idle'
}

function watchTricky() {
  const w = result.value?.weakest
  if (!w) return
  stopAttempt()
  mode.value = 'watch'
  camera.stop()
  focus.value = { start: Math.max(0, w.start - 0.75), end: w.end + 0.75 }
  speed.value = 0.5
  player?.seek(focus.value.start)
  playWatch()
}

// --- Practising (follow / memory) ----------------------------------------------------

async function startAttempt() {
  if (!player || !range.value) return
  error.value = ''
  result.value = null
  try {
    // Both inside the click: unlocks camera, sound and speech on phones.
    if (voiceOn.value) speak('Get ready.')
    await player.prime()
    if (!camera.active.value) await Promise.all([camera.start(), loadDetector()])
  } catch (e) {
    error.value = describeCameraError(e)
    return
  }
  player.pause()
  player.seek(range.value.start)
  player.setRate(speed.value)
  player.setMuted(false)
  // "Five, six, seven, eight": a dancer's count-in.
  phase.value = 'countdown'
  const beats = ['5', '6', '7', '8']
  const beat = 650
  beats.forEach((b, i) => {
    countdownTimer = window.setTimeout(() => {
      if (phase.value !== 'countdown') return
      count.value = Number(b)
      if (voiceOn.value) speak(b)
    }, i * beat)
  })
  countdownTimer = window.setTimeout(async () => {
    if (phase.value !== 'countdown') return
    scorer = new AttemptScorer(tutorial.value!.track, { user: camera.mirror.value, teacher: tutorial.value!.flipped })
    resultMode.value = mode.value
    lowSince = null
    liveHint.value = ''
    await player!.play()
    phase.value = 'running'
  }, beats.length * beat)
}

function stopAttempt() {
  clearTimeout(countdownTimer)
  if (phase.value === 'countdown' || phase.value === 'running') player?.pause()
  phase.value = 'idle'
  scorer = null
  liveScore.value = null
  liveHint.value = ''
}

async function finishAttempt() {
  player?.pause()
  const r = scorer!.result()
  scorer = null
  result.value = r
  phase.value = 'result'
  liveScore.value = null
  if (!runThrough.value && tutorial.value) {
    tutorial.value = await recordScore(tutorial.value, sectionIdx.value, resultMode.value === 'memory' ? 'memory' : 'follow', r.score)
  }
  if (voiceOn.value) {
    const praise = r.score >= 85 ? 'Excellent!' : r.score >= 70 ? 'Nice!' : r.score >= 50 ? 'Getting there.' : 'Keep practising.'
    speak(`${r.score} percent. ${praise} ${r.corrections[0] ?? ''}`)
  }
}

function nextSection() {
  if (sectionIdx.value < sections.value.length - 1) {
    selectSection(sectionIdx.value + 1)
    setMode('watch')
  } else {
    runThrough.value = true
    selectSection(sections.value.length - 1)
    setMode('memory')
  }
}

// --- The frame loop ----------------------------------------------------------------------

async function loop() {
  const t = player?.time() ?? 0
  const r = range.value
  if (player && r && phase.value === 'running') {
    if (mode.value === 'watch') {
      // Loop the section while watching.
      if (t >= r.end) player.seek(r.start)
    } else if (t >= r.end - 0.05) {
      await finishAttempt()
    } else if (scorer && camVideo.value && camVideo.value.readyState >= 2) {
      await practiseFrame(t)
    }
  }
  drawTeacherSkeleton(t)
  rafId = requestAnimationFrame(loop)
}

async function practiseFrame(t: number) {
  const user = (await detectVideo(camVideo.value!, performance.now()))?.image ?? null
  if (!scorer) return
  const frame = scorer.add(user, t)
  liveScore.value = frame.score

  const c = camCanvas.value
  const v = camVideo.value!
  if (c) {
    if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
      c.width = v.videoWidth
      c.height = v.videoHeight
    }
    const ctx = c.getContext('2d')!
    drawSkeleton(ctx, user, frame.comparison ? limbStatuses(frame.comparison) : new Map())
    const teacher = poseAt(tutorial.value!.track, t)
    if (mode.value === 'follow' && user && teacher) {
      const ghost = ghostPose({ points: user, flipped: camera.mirror.value }, { points: teacher, flipped: tutorial.value!.flipped })
      if (ghost) drawGhost(ctx, ghost)
    }
  }

  // Live hints only while following; from memory is about recall.
  if (mode.value !== 'follow') return
  const now = performance.now()
  const worst = frame.comparison?.limbs[0]
  if (frame.score < 60 && worst && worst.error > 35) {
    lowSince ??= now
    if (now - lowSince > 700) {
      liveHint.value = worst.hint
      if (voiceOn.value && now - lastSpoken.at > 3500 && (worst.hint !== lastSpoken.text || now - lastSpoken.at > 7000)) {
        speak(worst.hint)
        lastSpoken = { text: worst.hint, at: now }
      }
    }
  } else {
    lowSince = null
    if (frame.score >= 75) liveHint.value = ''
  }
}

function drawTeacherSkeleton(t: number) {
  const c = teacherCanvas.value
  const v = teacherVideo.value
  if (!c || !v || !tutorial.value) return
  if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
    c.width = v.videoWidth || 1
    c.height = v.videoHeight || 1
  }
  drawSkeleton(c.getContext('2d')!, skeleton.value ? poseAt(tutorial.value.track, t) : null, new Map())
}

// --- Display helpers ------------------------------------------------------------------------

const headline = computed(() => {
  if (phase.value === 'countdown') return 'Get ready…'
  if (mode.value === 'memory' && phase.value === 'running') return 'From memory: just the music now'
  if (liveHint.value) return liveHint.value
  if (phase.value === 'running') return mode.value === 'follow' ? 'Match the white ghost' : ''
  return mode.value === 'follow' ? 'Press Start, then copy the teacher' : 'Press Start and dance it from memory'
})
const scoreTone = computed(() => {
  const s = liveScore.value
  return s === null ? 'info' : s >= 75 ? 'good' : s >= 50 ? 'warn' : 'bad'
})
const sectionLabel = (s: Section) => `${formatTime(s.start)}–${formatTime(s.end)}`
const best = (i: number) => tutorial.value?.progress[i]
const verdict = computed(() => {
  const r = result.value
  if (!r) return ''
  if (resultMode.value === 'memory' && r.score >= MASTERED) {
    return runThrough.value ? 'You can dance it from memory! 🎉' : 'Section learned! ✓'
  }
  if (resultMode.value === 'follow' && r.score >= MASTERED) return 'Great. Now try it from memory.'
  return 'Watch the tricky part and try again.'
})
</script>

<template>
  <section class="studio">
    <div class="topbar">
      <button class="ghost" @click="$emit('back')">← Tutorials</button>
      <h2>{{ tutorial?.name ?? 'Loading…' }}</h2>
      <span v-if="tutorial" class="progress-label">{{ learnedCount }} / {{ sections.length }} learned</span>
    </div>
    <p v-if="loadError" class="error">{{ loadError }}</p>

    <template v-if="tutorial">
      <div class="sections" role="tablist" aria-label="Sections">
        <button
          v-for="(s, i) in sections"
          :key="i"
          role="tab"
          :aria-selected="i === sectionIdx && !runThrough"
          :class="['chip', { active: i === sectionIdx && !runThrough, learned: isMastered(tutorial, i) }]"
          @click="runThrough = false; selectSection(i)"
        >
          <span class="num">{{ i + 1 }}</span>
          <span v-if="isMastered(tutorial, i)" aria-label="learned">✓</span>
          <span class="time">{{ sectionLabel(s) }}</span>
        </button>
        <button :class="['chip', 'run', { active: runThrough }]" :aria-pressed="runThrough" @click="toggleRunThrough">
          ▶ Run-through 1–{{ sectionIdx + 1 }}
        </button>
      </div>

      <div class="modes" role="tablist" aria-label="Practice mode">
        <button role="tab" :aria-selected="mode === 'watch'" :class="{ active: mode === 'watch' }" @click="setMode('watch')">
          👀 Watch
        </button>
        <button role="tab" :aria-selected="mode === 'follow'" :class="{ active: mode === 'follow' }" @click="setMode('follow')">
          🪞 Follow along
        </button>
        <button role="tab" :aria-selected="mode === 'memory'" :class="{ active: mode === 'memory' }" @click="setMode('memory')">
          🧠 From memory
        </button>
      </div>

      <div class="stage" :class="mode">
        <div class="teacher" :class="{ hidden: mode === 'memory' }">
          <div v-if="isYouTube" class="yt" :class="{ flipped: tutorial.flipped }"><div ref="ytBox" /></div>
          <template v-else>
            <video ref="teacherVideo" :class="{ flipped: tutorial.flipped }" playsinline preload="auto" />
            <canvas ref="teacherCanvas" :class="{ flipped: tutorial.flipped }" />
          </template>
          <span class="tag">Teacher</span>
        </div>
        <div v-if="mode === 'memory'" class="memory-note">🎵 Music only: dance it from memory</div>

        <div v-show="mode !== 'watch'" class="you">
          <div class="cam" :class="{ mirrored: camera.mirror.value }">
            <video ref="camVideo" playsinline muted />
            <canvas ref="camCanvas" />
          </div>
          <div class="hud">
            <div v-if="headline" class="headline" :class="scoreTone">{{ headline }}</div>
            <div v-if="liveScore !== null" class="meter" :class="scoreTone">
              <span :style="{ width: `${liveScore}%` }" />
            </div>
          </div>
          <div v-if="phase === 'countdown'" class="countdown" aria-live="assertive">{{ count || '' }}</div>
          <div v-if="!camera.active.value && phase !== 'countdown'" class="cam-placeholder">
            Your camera appears here. Stand back so your whole body is in view.
          </div>
        </div>
      </div>

      <div class="controls">
        <template v-if="mode === 'watch'">
          <button v-if="phase !== 'running'" class="primary" @click="playWatch">▶ Play {{ focus ? 'tricky part' : 'section' }}</button>
          <button v-else class="primary" @click="pauseWatch">⏸ Pause</button>
          <button v-if="focus" class="ghost" @click="focus = null; selectSection(sectionIdx)">Whole section</button>
          <button v-if="!isYouTube" class="ghost" :aria-pressed="skeleton" @click="skeleton = !skeleton">
            Skeleton {{ skeleton ? 'on' : 'off' }}
          </button>
        </template>
        <template v-else>
          <button v-if="phase === 'idle' || phase === 'result'" class="primary" @click="startAttempt">
            ▶ {{ phase === 'result' ? 'Try again' : 'Start' }}
          </button>
          <button v-else class="primary" @click="stopAttempt">■ Stop</button>
          <button v-if="camera.active.value" class="ghost" @click="camera.switchCamera()">🔄 Camera</button>
        </template>

        <div class="speed" role="group" aria-label="Speed">
          <button
            v-for="s in [0.5, 0.75, 1]"
            :key="s"
            :class="{ active: speed === s }"
            :aria-pressed="speed === s"
            @click="speed = s; player?.setRate(s)"
          >
            {{ s }}×
          </button>
        </div>
        <button class="ghost" :aria-pressed="tutorial.flipped" @click="toggleFlip">⇋ Flip video</button>
        <button class="ghost" :aria-pressed="voiceOn" @click="voiceOn = !voiceOn">{{ voiceOn ? '🔊' : '🔇' }}</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="phase === 'result' && result" class="result">
        <div class="score">
          <span class="big">{{ result.score }}%</span>
          <span class="stars" :aria-label="`${stars(result.score)} of 3 stars`">
            {{ '★'.repeat(stars(result.score)) }}<span class="dim">{{ '★'.repeat(3 - stars(result.score)) }}</span>
          </span>
        </div>
        <p class="verdict">{{ verdict }}</p>
        <ul v-if="result.corrections.length" class="corrections">
          <li v-for="c in result.corrections" :key="c">{{ c }}</li>
        </ul>
        <div class="result-actions">
          <button v-if="result.weakest" class="ghost" @click="watchTricky">
            👀 Watch the tricky part ({{ formatTime(result.weakest.start) }})
          </button>
          <button v-if="resultMode === 'follow' && result.score >= MASTERED" class="primary" @click="setMode('memory')">
            🧠 Try from memory
          </button>
          <button
            v-if="resultMode === 'memory' && result.score >= MASTERED && !runThrough"
            class="primary"
            @click="nextSection"
          >
            {{ sectionIdx < sections.length - 1 ? 'Next section →' : 'Full run-through →' }}
          </button>
        </div>
      </div>

      <p class="muted small">
        Best scores for section {{ sectionIdx + 1 }}: follow {{ best(sectionIdx)?.follow ?? '–' }}% · memory
        {{ best(sectionIdx)?.memory ?? '–' }}%. A section is learned at {{ MASTERED }}% from memory.
        <template v-if="tutorial.flipped">The teacher video is shown mirrored.</template>
        Tip: if the teacher faces you, copy them like a mirror: their arm on the left of the screen is your left arm.
      </p>
    </template>
  </section>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
h2 {
  margin: 0;
  font-size: 1.3rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.progress-label {
  color: var(--muted);
  font-size: 0.9rem;
}
.sections {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.4rem;
  scrollbar-width: thin;
}
.chip {
  flex: none;
  gap: 0.35rem;
  padding: 0.35rem 0.8rem;
  font-size: 0.9rem;
}
.chip .num {
  font-weight: 700;
}
.chip .time {
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.chip.learned {
  border-color: var(--good);
}
.chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.chip.active .time {
  color: rgb(255 255 255 / 0.85);
}
.modes,
.speed {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px;
  background: var(--surface);
  gap: 2px;
}
.modes {
  margin: 0.5rem 0 0.75rem;
  max-width: 100%;
  overflow-x: auto;
}
.modes button,
.speed button {
  border: none;
  background: transparent;
  flex: none;
}
.modes button.active,
.speed button.active {
  background: var(--accent);
  color: #fff;
}

.stage {
  position: relative;
  display: grid;
  gap: 0.75rem;
}
.stage.follow,
.stage.memory {
  grid-template-columns: 1fr 1fr;
}
.teacher,
.you {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #000;
  min-height: 200px;
}
.teacher video,
.teacher canvas,
.cam video,
.cam canvas {
  display: block;
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
.teacher {
  display: grid;
}
.teacher > video,
.teacher > canvas {
  grid-area: 1 / 1;
}
.flipped {
  transform: scaleX(-1);
}
.yt {
  width: 100%;
  aspect-ratio: 16 / 9;
}
.yt :deep(iframe),
.yt > div {
  width: 100%;
  height: 100%;
  display: block;
}
.teacher.hidden {
  /* Keep playing (for the music) but out of sight. Not shrunk: YouTube won't play tiny players. */
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0;
  pointer-events: none;
}
.memory-note {
  display: grid;
  place-items: center;
  border-radius: 16px;
  background: var(--surface);
  border: 1px dashed var(--border);
  color: var(--muted);
  font-weight: 600;
  padding: 1rem;
  text-align: center;
}
.tag {
  position: absolute;
  left: 0.5rem;
  top: 0.5rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  color: #fff;
  font-size: 0.75rem;
  pointer-events: none;
}
.cam {
  display: grid;
}
.cam > video,
.cam > canvas {
  grid-area: 1 / 1;
}
.cam.mirrored {
  transform: scaleX(-1);
}
.cam-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  text-align: center;
  color: rgb(255 255 255 / 0.8);
}
.hud {
  position: absolute;
  inset: 0.5rem 0.5rem auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  pointer-events: none;
}
.headline {
  align-self: flex-start;
  padding: 0.5rem 0.8rem;
  border-radius: 12px;
  font-size: clamp(1rem, 3.4vw, 1.5rem);
  font-weight: 700;
  color: #fff;
  background: rgb(15 15 20 / 0.72);
  border-left: 6px solid #93c5fd;
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
.meter {
  height: 8px;
  border-radius: 4px;
  background: rgb(255 255 255 / 0.25);
  overflow: hidden;
}
.meter span {
  display: block;
  height: 100%;
  transition: width 0.15s;
  background: #93c5fd;
}
.meter.good span {
  background: #34d399;
}
.meter.warn span {
  background: #fbbf24;
}
.meter.bad span {
  background: #f87171;
}
.countdown {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: clamp(4rem, 20vw, 9rem);
  font-weight: 800;
  color: #fff;
  text-shadow: 0 4px 24px rgb(0 0 0 / 0.6);
  background: rgb(0 0 0 / 0.25);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
  align-items: center;
}
.result {
  margin-top: 1rem;
  padding: 1rem 1.2rem;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.score {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}
.big {
  font-size: 2.4rem;
  font-weight: 800;
}
.stars {
  font-size: 1.6rem;
  color: #f5b301;
  letter-spacing: 0.1em;
}
.stars .dim {
  color: var(--border);
}
.verdict {
  margin: 0.25rem 0 0.5rem;
  font-weight: 600;
}
.corrections {
  margin: 0 0 0.75rem;
  padding-left: 1.2rem;
}
.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.error {
  color: var(--bad);
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 0.85rem;
  margin-top: 1rem;
}

/* Phones: your camera fills the width; the teacher shrinks to a picture-in-picture. */
@media (max-width: 700px) {
  .stage.follow,
  .stage.memory {
    grid-template-columns: 1fr;
    margin: 0 -16px;
  }
  .stage.follow .teacher:not(.hidden) {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 38%;
    min-height: 0;
    z-index: 2;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.4);
  }
  .stage.follow .tag {
    display: none;
  }
  .stage.follow .hud {
    right: 42%;
  }
  .memory-note {
    margin: 0 16px;
  }
  .you {
    border-radius: 0;
  }
  .cam video,
  .cam canvas {
    max-height: calc(100svh - 230px);
  }
}
</style>
