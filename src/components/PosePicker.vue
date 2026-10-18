<script setup lang="ts">
import { POSES } from '@/poses'
import { MOVEMENTS } from '@/movements'
import type { Exercise } from '@/exercises'
import PoseFigure from './PoseFigure.vue'

defineEmits<{ select: [exercise: Exercise] }>()

const groups: { title: string; note?: string; items: Exercise[] }[] = [
  { title: 'Movement', note: 'Counted and checked rep by rep', items: MOVEMENTS },
  ...(['Ballet', 'Yoga', 'Strength'] as const).map((category) => ({
    title: `${category} positions`,
    items: POSES.filter((p) => p.category === category),
  })),
]
</script>

<template>
  <section class="picker">
    <p class="intro">
      Pick a movement or a position to practise. Your camera watches your form and tells you what to fix, live.
      Everything runs on your device: no video leaves your browser.
    </p>
    <div v-for="group in groups" :key="group.title" class="group">
      <h2>{{ group.title }}<span v-if="group.note" class="note"> · {{ group.note }}</span></h2>
      <div class="grid">
        <button v-for="item in group.items" :key="item.id" class="card" @click="$emit('select', item)">
          <span class="figure" aria-hidden="true"><PoseFigure :illustration="item.illustration" /></span>
          <span class="name">{{ item.name }}</span>
          <span class="summary">{{ item.summary }}</span>
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
.figure {
  display: block;
  width: 96px;
  aspect-ratio: 1;
  margin-bottom: 0.25rem;
}
.group + .group {
  margin-top: 2rem;
}
.note {
  text-transform: none;
  letter-spacing: 0;
  color: var(--muted);
  font-weight: 500;
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
@media (max-width: 560px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }
  .card {
    display: grid;
    grid-template-columns: 72px 1fr;
    grid-template-rows: auto 1fr;
    column-gap: 0.9rem;
    align-items: center;
    padding: 0.8rem;
  }
  .figure {
    grid-row: 1 / 3;
    width: 72px;
    margin: 0;
  }
  .name {
    align-self: end;
  }
  .summary {
    align-self: start;
    font-size: 0.85rem;
  }
}
</style>
