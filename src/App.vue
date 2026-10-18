<script setup lang="ts">
import { shallowRef } from 'vue'
import type { PoseDefinition } from '@/poses'
import PosePicker from './components/PosePicker.vue'
import PracticeView from './components/PracticeView.vue'

const selected = shallowRef<PoseDefinition | null>(null)
</script>

<template>
  <header>
    <h1>Dance Trainer</h1>
    <span class="tagline">Live form feedback from your camera</span>
  </header>
  <main>
    <PracticeView v-if="selected" :key="selected.id" :pose="selected" @back="selected = null" />
    <PosePicker v-else @select="selected = $event" />
  </main>
</template>

<style scoped>
header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1.25rem 0 1.5rem;
}
h1 {
  margin: 0;
  font-size: 1.6rem;
  letter-spacing: -0.02em;
}
.tagline {
  color: var(--muted);
}
</style>
