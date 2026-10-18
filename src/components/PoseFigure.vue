<script setup lang="ts">
import { computed } from 'vue'
import { L, SIDES, type SideIndices } from '@/pose/landmarks'
import type { CheckStatus, Illustration } from '@/poses'

const props = defineProps<{
  illustration: Illustration
  /** Landmarks to mark (e.g. the joints of the current correction). */
  highlight?: Map<number, CheckStatus>
  title?: string
}>()

type XY = [number, number]

const pts = computed(() => props.illustration.points)
const at = (i: number): XY | undefined => pts.value[i]
const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

const bounds = computed(() => {
  const all = Object.values(pts.value)
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const pad = 0.09
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  const maxX = Math.max(...xs) + pad
  const maxY = Math.max(...ys) + 0.04
  return { minX, minY, maxX, maxY, floor: Math.max(...ys) + 0.012 }
})

const viewBox = computed(() => {
  const b = bounds.value
  // Keep a square-ish frame so every figure sits at a similar scale.
  const w = b.maxX - b.minX
  const h = b.maxY - b.minY
  const size = Math.max(w, h)
  const x = b.minX - (size - w) / 2
  const y = b.minY - (size - h)
  return `${x} ${y} ${size} ${size}`
})

function limbs(s: SideIndices): XY[][] {
  const chain = (...ids: number[]) => ids.map(at).filter((p): p is XY => !!p)
  return [chain(s.shoulder, s.elbow, s.wrist, s.index), chain(s.hip, s.knee, s.ankle)].filter((c) => c.length > 1)
}

function foot(s: SideIndices): string | null {
  const a = at(s.ankle)
  const h = at(s.heel)
  const f = at(s.foot)
  return a && h && f ? [a, h, f].map((p) => p.join(',')).join(' ') : null
}

// Side views draw the right side (furthest from the viewer) fainter.
const sides = computed(() => {
  const far = props.illustration.view === 'side'
  return [
    { s: SIDES.right, far },
    { s: SIDES.left, far: false },
  ].map(({ s, far }) => ({ far, limbs: limbs(s), foot: foot(s) }))
})

// A tapered torso: shoulders, a narrower waist, then hips.
const torso = computed(() => {
  const ls = at(L.LEFT_SHOULDER)
  const rs = at(L.RIGHT_SHOULDER)
  const lh = at(L.LEFT_HIP)
  const rh = at(L.RIGHT_HIP)
  if (!ls || !rs || !lh || !rh) return ''
  const lerp = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  const centre = mid(mid(ls, rs), mid(lh, rh))
  const waist = (s: XY, h: XY) => lerp(centre, lerp(s, h, 0.6), 0.8)
  return [ls, rs, waist(rs, rh), rh, lh, waist(ls, lh)].map((p) => p.join(',')).join(' ')
})

const head = computed(() => {
  const le = at(L.LEFT_EAR)
  const re = at(L.RIGHT_EAR)
  const nose = at(L.NOSE)
  const ears = le && re ? mid(le, re) : (le ?? re)
  if (!ears) return null
  const c = props.illustration.view === 'side' && nose ? mid(ears, nose) : ears
  const ls = at(L.LEFT_SHOULDER)
  const rs = at(L.RIGHT_SHOULDER)
  const neck = ls && rs ? mid(ls, rs) : null
  return { c, neck }
})

const marks = computed(() =>
  [...(props.highlight ?? new Map())]
    .filter(([, status]) => status === 'bad' || status === 'warn')
    .map(([i, status]) => ({ p: at(i), status }))
    .filter((m): m is { p: XY; status: CheckStatus } => !!m.p),
)

const path = (c: XY[]) => 'M' + c.map((p) => p.join(',')).join('L')
</script>

<template>
  <svg class="figure" :viewBox="viewBox" role="img" :aria-label="title ?? 'Illustration of the position'">
    <line
      class="floor"
      :x1="bounds.minX"
      :x2="bounds.maxX"
      :y1="bounds.floor"
      :y2="bounds.floor"
    />
    <g v-for="(side, i) in sides" :key="i" :class="side.far ? 'far' : 'near'">
      <path v-for="(c, j) in side.limbs" :key="j" class="limb" :d="path(c)" />
      <polygon v-if="side.foot" class="foot" :points="side.foot" />
    </g>
    <polygon class="torso" :points="torso" />
    <template v-if="head">
      <line v-if="head.neck" class="neck" :x1="head.neck[0]" :y1="head.neck[1]" :x2="head.c[0]" :y2="head.c[1]" />
      <circle class="head" :cx="head.c[0]" :cy="head.c[1]" r="0.052" />
    </template>
    <circle v-for="(m, i) in marks" :key="'m' + i" :class="['mark', m.status]" :cx="m.p[0]" :cy="m.p[1]" r="0.04" />
  </svg>
</template>

<style scoped>
.figure {
  display: block;
  width: 100%;
  height: 100%;
  --ink: var(--accent);
  --ink-far: color-mix(in srgb, var(--accent) 40%, var(--surface));
}
.floor {
  stroke: var(--border);
  stroke-width: 0.012;
  stroke-linecap: round;
}
.limb,
.neck {
  fill: none;
  stroke-width: 0.04;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.near .limb,
.neck {
  stroke: var(--ink);
}
.far .limb {
  stroke: var(--ink-far);
}
.foot {
  stroke-width: 0.02;
  stroke-linejoin: round;
}
.near .foot {
  fill: var(--ink);
  stroke: var(--ink);
}
.far .foot {
  fill: var(--ink-far);
  stroke: var(--ink-far);
}
.torso {
  fill: var(--ink);
  stroke: var(--ink);
  stroke-width: 0.035;
  stroke-linejoin: round;
}
.head {
  fill: var(--ink);
}
.mark {
  stroke-width: 0.012;
  fill-opacity: 0.35;
}
.mark.bad {
  fill: var(--bad);
  stroke: var(--bad);
}
.mark.warn {
  fill: var(--warn);
  stroke: var(--warn);
}
</style>
