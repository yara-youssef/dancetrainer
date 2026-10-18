import { LANDMARK_COUNT, SIDES, type Point, type PoseFrame } from '@/pose/landmarks'
import type { CheckResult, PoseDefinition } from '../types'

type Coords = Record<number, [number, number]>

/** Builds a frame from 2D coordinates; world landmarks mirror the image ones. */
export function frameFrom(coords: Coords, hidden: number[] = []): PoseFrame {
  const image: Point[] = Array.from({ length: LANDMARK_COUNT }, (_, i) => {
    const c = coords[i]
    return c
      ? { x: c[0], y: c[1], z: 0, visibility: hidden.includes(i) ? 0.2 : 0.99 }
      : { x: 0.5, y: 0.5, z: 0, visibility: 0.1 }
  })
  return { image, world: image.map((p) => ({ ...p })) }
}

/** For side-view fixtures: copy the near side onto the far side with low visibility. */
export function withFarSide(coords: Coords, near: 'left' | 'right'): { coords: Coords; hidden: number[] } {
  const n = SIDES[near]
  const f = SIDES[near === 'left' ? 'right' : 'left']
  const out: Coords = { ...coords }
  const hidden: number[] = []
  for (const key of Object.keys(n) as (keyof typeof n)[]) {
    const c = coords[n[key]]
    if (c) {
      out[f[key]] = [c[0] + 0.01, c[1]]
      hidden.push(f[key])
    }
  }
  return { coords: out, hidden }
}

export function analyse(pose: PoseDefinition, frame: PoseFrame): Record<string, CheckResult> | string {
  const prep = pose.prepare(frame)
  if (!prep.ready) return prep.hint
  return Object.fromEntries(pose.checks.map((c) => [c.id, c.evaluate(prep.ctx)]))
}

export function statuses(result: Record<string, CheckResult> | string): Record<string, string> | string {
  if (typeof result === 'string') return result
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.status]))
}
