import type { PoseFrame } from '@/pose/landmarks'

export type CheckStatus = 'good' | 'warn' | 'bad' | 'unknown'

export interface CheckResult {
  status: CheckStatus
  /** Correction to show/speak when status is warn or bad. */
  message?: string
  /** Measured value, shown for transparency (e.g. "164°"). */
  detail?: string
  /** Landmark indices to highlight on the skeleton when this check fails. */
  joints?: number[]
}

export interface FormCheck<C> {
  id: string
  /** What good form looks like, e.g. "Standing leg straight". */
  label: string
  evaluate(ctx: C): CheckResult
}

export type Preparation<C> =
  | { ready: true; ctx: C }
  /** The person isn't in the position yet (or isn't fully visible). */
  | { ready: false; hint: string }

export interface PoseDefinition<C = unknown> {
  id: string
  name: string
  category: 'Ballet' | 'Yoga' | 'Strength'
  emoji: string
  summary: string
  /** Where to put the camera / which way to face. */
  cameraTip: string
  /** Key things to think about, shown before practising. */
  cues: string[]
  prepare(frame: PoseFrame): Preparation<C>
  /** Checks in priority order: the first failing one is the one spoken aloud. */
  checks: FormCheck<C>[]
}

/** Helper that keeps each pose's context type internal to its module. */
export function definePose<C>(def: PoseDefinition<C>): PoseDefinition {
  return def as unknown as PoseDefinition
}

export interface Band {
  /** Inclusive range considered correct. */
  good: [number, number]
  /** How far outside `good` still counts as a minor (warn) issue. */
  tolerance: number
}

/** Grades a measurement: 'good' inside the band, 'warn' just outside, 'bad' beyond. */
export function grade(value: number, band: Band): { status: CheckStatus; direction: 'low' | 'high' | 'ok' } {
  const [lo, hi] = band.good
  if (value >= lo && value <= hi) return { status: 'good', direction: 'ok' }
  const direction = value < lo ? 'low' : 'high'
  const miss = value < lo ? lo - value : value - hi
  return { status: miss <= band.tolerance ? 'warn' : 'bad', direction }
}

export const fmtDeg = (v: number) => `${Math.round(v)}°`
