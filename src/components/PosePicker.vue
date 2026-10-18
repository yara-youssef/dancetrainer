<script setup lang="ts">
import { POSES, type PoseDefinition } from '@/poses'

defineEmits<{ select: [pose: PoseDefinition] }>()

const groups = (['Ballet', 'Yoga', 'Strength'] as const).map((category) => ({
  category,
  poses: POSES.filter((p) => p.category === category),
}))
</script>

<template>
  <section class="picker">
    <p class="intro">
      Pick a position to practise. Your camera watches your form and tells you what to fix, live.
      Everything runs on your device: no video leaves your browser.
    </p>
    <div v-for="group in groups" :key="group.category" class="group">
      <h2>{{ group.category }}</h2>
      <div class="grid">
        <button v-for="pose in group.poses" :key="pose.id" class="card" @click="$emit('select', pose)">
          <span class="emoji" aria-hidden="true">{{ pose.emoji }}</span>
          <span class="name">{{ pose.name }}</span>
          <span class="summary">{{ pose.summary }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.intro {
  color: var(--muted);
  max-width: 60ch;
  margin: 0 0 1.5rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  text-align: left;
  padding: 1.25rem;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    transform 0.15s,
    border-color 0.15s;
}
.card:hover,
.card:focus-visible {
  transform: translateY(-2px);
  border-color: var(--accent);
}
.emoji {
  font-size: 2rem;
}
.group + .group {
  margin-top: 2rem;
}
h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  margin: 0 0 0.75rem;
}
.name {
  font-size: 1.2rem;
  font-weight: 600;
}
.summary {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
