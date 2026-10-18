<script setup lang="ts">
import { computed, useId } from 'vue'
import { L, SIDES, type SideIndices } from '@/pose/landmarks'
import type { CheckStatus, Illustration } from '@/poses'

const props = defineProps<{
  illustration: Illustration
  /** Landmarks to mark (e.g. the joints of the current correction). */
  highlight?: Map<number, CheckStatus>
  title?: string
}>()

type XY = [number, number]

const id = useId()
const pts = computed(() => props.illustration.points)
const at = (i: number): XY | undefined => pts.value[i]
const mid = (a: XY, b: XY): XY => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

const bounds = computed(() => {
  const all = [...Object.values(pts.value), ...Object.values(props.illustration.ghost ?? {})]
  const xs = all.map((p) => p[0])
  const ys = all.map((p) => p[1])
  const pad = props.illustration.spin ? 0.16 : 0.09
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - 0.09
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

/** Everything needed to draw one figure from a set of points. */
function figure(points: Record<number, XY>, view: 'front' | 'side') {
  const get = (i: number): XY | undefined => points[i]
  const chain = (...ids: number[]) => ids.map(get).filter((p): p is XY => !!p)
  const side = (s: SideIndices, far: boolean) => {
    const a = get(s.ankle)
    const h = get(s.heel)
    const f = get(s.foot)
    return {
      far,
      limbs: [chain(s.shoulder, s.elbow, s.wrist, s.index), chain(s.hip, s.knee, s.ankle)].filter((c) => c.length > 1),
      foot: a && h && f ? [a, h, f].map((p) => p.join(',')).join(' ') : null,
    }
  }
  // Side views draw the right side (furthest from the viewer) fainter.
  const sides = [side(SIDES.right, view === 'side'), side(SIDES.left, false)]

  // A tapered torso: shoulders, a narrower waist, then hips.
  let torso = ''
  const [ls, rs, lh, rh] = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP].map(get)
  if (ls && rs && lh && rh) {
    const lerp = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const centre = mid(mid(ls, rs), mid(lh, rh))
    const waist = (s: XY, h: XY) => lerp(centre, lerp(s, h, 0.6), 0.8)
    torso = [ls, rs, waist(rs, rh), rh, lh, waist(ls, lh)].map((p) => p.join(',')).join(' ')
  }

  let head = null
  const le = get(L.LEFT_EAR)
  const re = get(L.RIGHT_EAR)
  const nose = get(L.NOSE)
  const ears = le && re ? mid(le, re) : (le ?? re)
  if (ears) {
    const c = view === 'side' && nose ? mid(ears, nose) : ears
    head = { c, neck: ls && rs ? mid(ls, rs) : null }
  }
  return { sides, torso, head }
}

const layers = computed(() => {
  const { points, ghost, view } = props.illustration
  return [
    ...(ghost ? [{ ghost: true, ...figure({ ...points, ...ghost }, view) }] : []),
    { ghost: false, ...figure(points, view) },
  ]
})

/** A rotation arrow around the lower legs, for turns. */
const spin = computed(() => {
  if (!props.illustration.spin) return null
  const lh = at(L.LEFT_HIP)
  const rh = at(L.RIGHT_HIP)
  if (!lh || !rh) return null
  const cx = mid(lh, rh)[0]
  const cy = bounds.value.floor - 0.2
  const rx = 0.2
  const ry = 0.05
  const arc = (from: number, to: number) => {
    const pts: string[] = []
    for (let i = 0; i <= 24; i++) {
      const t = from + ((to - from) * i) / 24
      pts.push(`${cx + rx * Math.cos(t)},${cy + ry * Math.sin(t)}`)
    }
    return 'M' + pts.join('L')
  }
  // Back half behind the figure, front half in front of it with an arrowhead.
  return { back: arc(Math.PI, 2 * Math.PI), front: arc(0.1, Math.PI - 0.15) }
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
    <defs v-if="spin">
      <marker :id="`${id}-arrow`" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
        <path d="M0,0L10,5L0,10z" class="arrowhead" />
      </marker>
    </defs>
    <path v-if="spin" class="spin back" :d="spin.back" />
    <g v-for="(layer, k) in layers" :key="k" :class="{ ghost: layer.ghost }">
      <g v-for="(side, i) in layer.sides" :key="i" :class="side.far ? 'far' : 'near'">
        <path v-for="(c, j) in side.limbs" :key="j" class="limb" :d="path(c)" />
        <polygon v-if="side.foot" class="foot" :points="side.foot" />
      </g>
      <polygon class="torso" :points="layer.torso" />
      <template v-if="layer.head">
        <line
          v-if="layer.head.neck"
          class="neck"
          :x1="layer.head.neck[0]"
          :y1="layer.head.neck[1]"
          :x2="layer.head.c[0]"
          :y2="layer.head.c[1]"
        />
        <circle class="head" :cx="layer.head.c[0]" :cy="layer.head.c[1]" r="0.052" />
      </template>
    </g>
    <path v-if="spin" class="spin" :d="spin.front" :marker-end="`url(#${id}-arrow)`" />
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
.ghost {
  opacity: 0.28;
}
.spin {
  fill: none;
  stroke: var(--ink);
  stroke-width: 0.018;
  stroke-linecap: round;
}
.spin.back {
  stroke: var(--ink-far);
}
.arrowhead {
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
