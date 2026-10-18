<script setup lang="ts">
import { computed } from 'vue'
import type { MovementFeedback } from '@/movements'

const props = defineProps<{ feedback: MovementFeedback | null; unit: string }>()
defineEmits<{ reset: [] }>()

const reps = computed(() => props.feedback?.reps ?? [])
const clean = computed(() => reps.value.filter((r) => r.ok).length)
const plural = (n: number) => `${props.unit}${n === 1 ? '' : 's'}`
</script>

<template>
  <div class="panel">
    <div class="stats">
      <div class="stat">
        <span class="value">{{ reps.length }}</span>
        <span class="label">{{ plural(reps.length) }}</span>
      </div>
      <div class="stat">
        <span class="value">{{ clean }}</span>
        <span class="label">clean</span>
      </div>
      <div class="stat">
        <span class="value small">{{ feedback?.phase ?? '–' }}</span>
        <span class="label">now</span>
      </div>
    </div>

    <p v-if="reps.length === 0" class="empty">
      Each {{ unit }} appears here with what went well and what to fix.
    </p>
    <ol v-else class="reps" reversed>
      <li v-for="r in [...reps].reverse()" :key="r.n" :class="r.ok ? 'good' : 'bad'">
        <span class="icon" aria-hidden="true">{{ r.ok ? '✓' : '!' }}</span>
        <div class="text">
          <div class="title">{{ r.title }}<span v-if="r.ok" class="clean"> · clean</span></div>
          <div v-for="f in r.faults" :key="f" class="fault">{{ f }}</div>
          <div class="details">{{ r.details.join(' · ') }}</div>
        </div>
      </li>
    </ol>
    <button v-if="reps.length" class="ghost reset" @click="$emit('reset')">Reset count</button>
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
.value {
  font-size: 1.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.value.small {
  font-size: 1rem;
  line-height: 2.4rem;
}
.label {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.empty {
  color: var(--muted);
  margin: 0;
}
.reps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.reps li {
  display: flex;
  gap: 0.75rem;
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
}
li.good .icon {
  background: var(--good-bg);
  color: var(--good);
}
li.bad .icon {
  background: var(--warn-bg);
  color: var(--warn);
}
.title {
  font-weight: 600;
}
.clean {
  color: var(--good);
  font-weight: 500;
}
.fault {
  font-size: 0.9rem;
}
.details {
  font-size: 0.8rem;
  color: var(--muted);
  margin-top: 0.15rem;
}
.reset {
  align-self: flex-start;
}
</style>
