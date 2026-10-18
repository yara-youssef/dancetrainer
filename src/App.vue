<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Exercise } from '@/exercises'
import PosePicker from './components/PosePicker.vue'
import PracticeView from './components/PracticeView.vue'
import TutorialLibrary from './components/tutorial/TutorialLibrary.vue'
import TutorialImport from './components/tutorial/TutorialImport.vue'
import TutorialStudio from './components/tutorial/TutorialStudio.vue'

type Screen =
  | { name: 'home' }
  | { name: 'exercise'; exercise: Exercise }
  | { name: 'tutorials' }
  | { name: 'import'; file?: File; youtubeId?: string }
  | { name: 'studio'; id: string }

const logoUrl = `${import.meta.env.BASE_URL}logo.svg`
const screen = shallowRef<Screen>({ name: 'home' })
const go = (s: Screen) => {
  screen.value = s
  window.scrollTo(0, 0)
}
</script>

<template>
  <header>
    <img class="logo" :src="logoUrl" alt="" width="40" height="40" />
    <h1>Dance Trainer</h1>
    <span class="tagline">Live form feedback from your camera</span>
  </header>
  <main>
    <PracticeView
      v-if="screen.name === 'exercise'"
      :key="screen.exercise.id"
      :exercise="screen.exercise"
      @back="go({ name: 'home' })"
    />
    <TutorialLibrary
      v-else-if="screen.name === 'tutorials'"
      @back="go({ name: 'home' })"
      @open="go({ name: 'studio', id: $event })"
      @import-file="go({ name: 'import', file: $event })"
      @import-you-tube="go({ name: 'import', youtubeId: $event })"
    />
    <TutorialImport
      v-else-if="screen.name === 'import'"
      :file="screen.file"
      :youtube-id="screen.youtubeId"
      @done="go({ name: 'studio', id: $event })"
      @cancel="go({ name: 'tutorials' })"
    />
    <TutorialStudio v-else-if="screen.name === 'studio'" :id="screen.id" :key="screen.id" @back="go({ name: 'tutorials' })" />
    <PosePicker v-else @select="go({ name: 'exercise', exercise: $event })" @tutorials="go({ name: 'tutorials' })" />
  </main>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1.25rem 0 1.5rem;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
}
h1 {
  margin: 0;
  font-size: 1.6rem;
  letter-spacing: -0.02em;
}
.tagline {
  color: var(--muted);
}
@media (max-width: 560px) {
  header {
    padding: 0.75rem 0 0.75rem;
  }
  h1 {
    font-size: 1.25rem;
  }
  .logo {
    width: 32px;
    height: 32px;
  }
  .tagline {
    display: none;
  }
}
</style>
