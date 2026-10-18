<script setup lang="ts">
import { shallowRef } from 'vue'
import type { Exercise } from '@/exercises'
import PosePicker from './components/PosePicker.vue'
import PracticeView from './components/PracticeView.vue'

const logoUrl = `${import.meta.env.BASE_URL}logo.svg`
const selected = shallowRef<Exercise | null>(null)
</script>

<template>
  <header>
    <img class="logo" :src="logoUrl" alt="" width="40" height="40" />
    <h1>Dance Trainer</h1>
    <span class="tagline">Live form feedback from your camera</span>
  </header>
  <main>
    <PracticeView v-if="selected" :key="selected.id" :exercise="selected" @back="selected = null" />
    <PosePicker v-else @select="selected = $event" />
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
