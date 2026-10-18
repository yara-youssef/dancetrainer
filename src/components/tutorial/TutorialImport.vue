<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Cancelled, analyseVideoFile, analyseYouTube, thumbnail } from '@/tutorial/extract'
import { YouTubePlayer } from '@/tutorial/player'
import { splitSections, type PoseTrack } from '@/tutorial/track'
import { newId, saveTutorial, type Tutorial } from '@/tutorial/library'

const props = defineProps<{ file?: File; youtubeId?: string }>()
const emit = defineEmits<{ done: [id: string]; cancel: [] }>()

const name = ref(props.file ? props.file.name.replace(/\.[^.]+$/, '') : 'YouTube tutorial')
const progress = ref(0)
const busy = ref(false)
const error = ref('')
const ytReady = ref(false)

const video = ref<HTMLVideoElement>()
const ytBox = ref<HTMLElement>()
let url = ''
let player: YouTubePlayer | null = null
const abort = new AbortController()

onMounted(async () => {
  if (props.file) {
    url = URL.createObjectURL(props.file)
    video.value!.src = url
    await analyseFile()
  } else if (props.youtubeId) {
    try {
      player = await YouTubePlayer.create(ytBox.value!, props.youtubeId)
      if (player.title()) name.value = player.title()
      ytReady.value = true
    } catch (e) {
      error.value = (e as Error).message
    }
  }
})

onBeforeUnmount(() => {
  abort.abort()
  player?.destroy()
  if (url) URL.revokeObjectURL(url)
})

async function analyseFile() {
  busy.value = true
  error.value = ''
  try {
    const track = await analyseVideoFile(video.value!, (p) => (progress.value = p), abort.signal)
    await video.value!.play().catch(() => {})
    video.value!.pause()
    await finish(track, { kind: 'file' }, thumbAt(video.value!, track.duration * 0.3))
  } catch (e) {
    if (!(e instanceof Cancelled)) error.value = describe(e)
  } finally {
    busy.value = false
  }
}

async function analyseYT() {
  if (!player || !props.youtubeId) return
  busy.value = true
  error.value = ''
  progress.value = 0
  try {
    const { track } = await analyseYouTube(player, (p) => (progress.value = p), abort.signal)
    await finish(track, { kind: 'youtube', videoId: props.youtubeId }, `https://i.ytimg.com/vi/${props.youtubeId}/mqdefault.jpg`)
  } catch (e) {
    if (!(e instanceof Cancelled)) error.value = describe(e)
  } finally {
    busy.value = false
  }
}

async function finish(track: PoseTrack, source: Tutorial['source'], thumb: Promise<string | undefined> | string | undefined) {
  const found = track.frames.filter(Boolean).length
  if (found < track.frames.length * 0.2) {
    throw new Error(
      "Couldn't see a dancer clearly in most of this video. Choose a video where the teacher's whole body is in view.",
    )
  }
  const tutorial: Tutorial = {
    id: newId(),
    name: name.value.trim() || 'My tutorial',
    createdAt: Date.now(),
    source,
    track,
    sections: splitSections(track),
    flipped: false,
    progress: {},
    thumbnail: await thumb,
  }
  await saveTutorial(tutorial, props.file)
  emit('done', tutorial.id)
}

async function thumbAt(v: HTMLVideoElement, t: number): Promise<string | undefined> {
  await new Promise<void>((resolve) => {
    v.addEventListener('seeked', () => resolve(), { once: true })
    v.currentTime = t
  })
  return thumbnail(v)
}

function describe(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Screen sharing was cancelled. Click Analyse and choose "This tab" to continue.'
  if (name === 'QuotaExceededError') return 'Your device is out of storage space for this video. Try a shorter clip.'
  return (e as Error)?.message ?? String(e)
}

function cancel() {
  abort.abort()
  emit('cancel')
}
</script>

<template>
  <section class="import">
    <div class="topbar">
      <button class="ghost" @click="cancel">← Cancel</button>
      <h2>Add a tutorial</h2>
    </div>

    <label class="name">
      <span>Name</span>
      <input v-model="name" type="text" maxlength="80" />
    </label>

    <div class="media">
      <video v-if="file" ref="video" playsinline muted preload="auto" />
      <div v-else class="yt-frame"><div ref="ytBox" /></div>
    </div>

    <div v-if="busy" class="progress">
      <div class="bar"><span :style="{ width: `${Math.round(progress * 100)}%` }" /></div>
      <p>
        Studying the teacher's moves… {{ Math.round(progress * 100) }}%
        <template v-if="youtubeId">Keep this tab open and visible until the video finishes.</template>
      </p>
    </div>

    <template v-if="youtubeId && !busy">
      <div class="help">
        <p><strong>How this works:</strong> browsers don't let apps read YouTube videos directly, so:</p>
        <ol>
          <li>Click <strong>Analyse</strong> and choose <strong>This tab</strong> when your browser asks what to share.</li>
          <li>The video plays once (muted) while the app watches the teacher. Keep this tab visible.</li>
          <li>When it ends, the dance is split into sections and saved, ready to practise.</li>
        </ol>
      </div>
      <button class="primary" :disabled="!ytReady" @click="analyseYT">Analyse ({{ ytReady ? 'share this tab' : 'loading…' }})</button>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
    <button v-if="error && file" class="ghost" @click="analyseFile">Try again</button>
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
.name {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-width: 480px;
  margin-bottom: 1rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.name input {
  font: inherit;
  font-size: 1rem;
  min-height: 44px;
  padding: 0 0.8rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.media {
  max-width: 720px;
  border-radius: 14px;
  overflow: hidden;
  background: #000;
}
.media video {
  display: block;
  width: 100%;
  max-height: 50vh;
  object-fit: contain;
}
.yt-frame {
  aspect-ratio: 16 / 9;
}
.yt-frame :deep(iframe),
.yt-frame > div {
  width: 100%;
  height: 100%;
  display: block;
}
.progress {
  max-width: 720px;
  margin-top: 1rem;
}
.bar {
  height: 10px;
  border-radius: 5px;
  background: var(--border);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s;
}
.help {
  max-width: 720px;
  margin: 1rem 0;
  padding: 0.8rem 1rem;
  border-radius: 12px;
  background: var(--info-bg);
  color: var(--info);
}
.help p {
  margin: 0 0 0.4rem;
}
.help ol {
  margin: 0;
  padding-left: 1.2rem;
}
.error {
  color: var(--bad);
  max-width: 720px;
}
</style>
