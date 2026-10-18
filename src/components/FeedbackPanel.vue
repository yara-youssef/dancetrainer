<script setup lang="ts">
import type { Feedback } from '@/pose/engine'

defineProps<{ feedback: Feedback | null; live: boolean }>()

const icons = { good: '✓', warn: '!', bad: '✕', unknown: '–' } as const
</script>

<template>
  <div class="panel">
    <div v-if="feedback?.phase === 'checking'" class="stats">
      <div class="stat">
        <span class="value">{{ feedback.score }}%</span>
        <span class="label">form</span>
      </div>
      <template v-if="live">
        <div class="stat">
          <span class="value">{{ feedback.holdSeconds.toFixed(1) }}s</span>
          <span class="label">holding</span>
        </div>
        <div class="stat">
          <span class="value">{{ feedback.bestHold.toFixed(1) }}s</span>
          <span class="label">best</span>
        </div>
      </template>
    </div>

    <ul class="checks">
      <li v-for="c in feedback?.checks ?? []" :key="c.id" :class="c.status">
        <span class="icon" aria-hidden="true">{{ icons[c.status] }}</span>
        <div class="text">
          <div class="row">
            <span class="check-label">{{ c.label }}</span>
            <span v-if="c.detail" class="detail">{{ c.detail }}</span>
          </div>
          <div v-if="(c.status === 'bad' || c.status === 'warn') && c.message" class="message">
            {{ c.message }}
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.stats {
  display: flex;
  gap: 0.75rem;
}
.stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.stat .value {
  font-size: 1.4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.stat .label {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.checks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.checks li {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.icon {
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.9rem;
  background: var(--border);
  color: var(--muted);
}
li.good .icon {
  background: var(--good-bg);
  color: var(--good);
}
li.warn .icon {
  background: var(--warn-bg);
  color: var(--warn);
}
li.bad .icon {
  background: var(--bad-bg);
  color: var(--bad);
}
li.bad {
  border-color: var(--bad);
}
.text {
  flex: 1;
  min-width: 0;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.check-label {
  font-weight: 500;
}
.detail {
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.message {
  margin-top: 0.2rem;
  font-size: 0.9rem;
  color: var(--muted);
}
</style>
