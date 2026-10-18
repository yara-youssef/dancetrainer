<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { deleteTutorial, isMastered, listTutorials, type Tutorial } from '@/tutorial/library'
import { SAVE_INSTRUCTIONS, parseLink } from '@/tutorial/links'
import { canCaptureTab } from '@/tutorial/extract'

const emit = defineEmits<{
  back: []
  open: [id: string]
  importFile: [file: File]
  importYouTube: [videoId: string]
}>()

const tutorials = shallowRef<Tutorial[]>([])
const loading = ref(true)
const link = ref('')
const linkHelp = ref<string[] | null>(null)
const linkError = ref('')
const storageError = ref('')

const desktopCapture = computed(() => canCaptureTab())

async function refresh() {
  try {
    tutorials.value = await listTutorials()
  } catch {
    storageError.value = "Your browser isn't letting this app save tutorials (private browsing?). They won't be kept."
  } finally {
    loading.value = false
  }
}
onMounted(refresh)

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('importFile', file)
}

function useLink() {
  linkError.value = ''
  linkHelp.value = null
  const info = parseLink(link.value)
  if (info.platform === 'invalid') {
    linkError.value = "That doesn't look like a link. Copy it from the app's Share button and paste it here."
    return
  }
  if (info.platform === 'youtube') {
    if (!desktopCapture.value) {
      linkHelp.value = [
        'Reading YouTube videos needs a computer (Chrome or Edge). On a phone:',
        'Start your phone’s screen recording, play the video, then stop recording.',
        'Then choose Upload a video and pick the recording.',
      ]
      return
    }
    emit('importYouTube', info.videoId)
    return
  }
  linkHelp.value = SAVE_INSTRUCTIONS[info.platform]
}

async function remove(t: Tutorial) {
  if (!confirm(`Delete “${t.name}” and its progress?`)) return
  await deleteTutorial(t.id)
  await refresh()
}

const learned = (t: Tutorial) => t.sections.filter((_, i) => isMastered(t, i)).length
</script>

<template>
  <section class="library">
    <div class="topbar">
      <button class="ghost" @click="$emit('back')">← Home</button>
      <h2>Learn a choreography</h2>
    </div>

    <ol class="steps">
      <li><strong>Add a tutorial.</strong> The app studies the teacher's moves and splits the dance into short sections.</li>
      <li><strong>Watch</strong> each section slowed down, then <strong>follow along</strong>: match the white ghost of the teacher on your camera.</li>
      <li><strong>Dance it from memory</strong> with just the music. Learn every section, then do a full run-through.</li>
    </ol>

    <div class="add">
      <label class="button primary">
        ⬆ Upload a video
        <input type="file" accept="video/*" hidden @change="onFile" />
      </label>
      <form class="link" @submit.prevent="useLink">
        <input v-model="link" type="url" inputmode="url" placeholder="…or paste a YouTube, TikTok or Instagram link" />
        <button type="submit" class="ghost" :disabled="!link.trim()">Use link</button>
      </form>
    </div>
    <p v-if="linkError" class="error">{{ linkError }}</p>
    <div v-if="linkHelp" class="help">
      <p v-for="line in linkHelp" :key="line">{{ line }}</p>
    </div>
    <p class="muted small">
      Tip: trim the video to just the dance part, and choose a tutorial where the teacher's whole body is visible.
      Everything stays on this device.
    </p>
    <p v-if="storageError" class="error">{{ storageError }}</p>

    <h3 v-if="tutorials.length">Your tutorials</h3>
    <ul class="list">
      <li v-for="t in tutorials" :key="t.id" class="item">
        <button class="open" @click="$emit('open', t.id)">
          <img v-if="t.thumbnail" :src="t.thumbnail" alt="" class="thumb" />
          <span v-else class="thumb placeholder" aria-hidden="true">🎬</span>
          <span class="text">
            <span class="name">{{ t.name }}</span>
            <span class="meta">
              {{ learned(t) }} / {{ t.sections.length }} sections learned
              <template v-if="t.source.kind === 'youtube'"> · YouTube</template>
            </span>
            <span class="bar"><span :style="{ width: `${(learned(t) / Math.max(1, t.sections.length)) * 100}%` }" /></span>
          </span>
        </button>
        <button class="ghost delete" :aria-label="`Delete ${t.name}`" @click="remove(t)">🗑</button>
      </li>
    </ul>
    <p v-if="!loading && !tutorials.length" class="muted">No tutorials yet. Add one above to get started.</p>
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
h3 {
  margin: 2rem 0 0.75rem;
}
.steps {
  margin: 0 0 1.25rem;
  padding-left: 1.3rem;
  color: var(--muted);
  max-width: 70ch;
  display: grid;
  gap: 0.35rem;
}
.steps strong {
  color: var(--text);
}
.add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}
.link {
  display: flex;
  flex: 1 1 320px;
  gap: 0.5rem;
}
.link input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 0 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.help {
  margin-top: 0.75rem;
  padding: 0.8rem 1rem;
  border-radius: 12px;
  background: var(--info-bg);
  color: var(--info);
}
.help p {
  margin: 0.2rem 0;
}
.error {
  color: var(--bad);
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 0.85rem;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.6rem;
}
.item {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}
.open {
  flex: 1;
  display: flex;
  gap: 0.9rem;
  align-items: center;
  justify-content: flex-start;
  text-align: left;
  border-radius: 14px;
  padding: 0.6rem;
}
.thumb {
  width: 96px;
  height: 64px;
  object-fit: cover;
  border-radius: 8px;
  flex: none;
  background: var(--border);
}
.placeholder {
  display: grid;
  place-items: center;
  font-size: 1.6rem;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  flex: 1;
}
.name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  font-size: 0.85rem;
  color: var(--muted);
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  overflow: hidden;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--good);
}
.delete {
  border-radius: 14px;
}
</style>
