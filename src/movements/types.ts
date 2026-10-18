import type { PoseFrame } from '@/pose/landmarks'
import type { Tone } from '@/pose/banner'
import type { CheckStatus, Illustration } from '@/poses/types'

/** The verdict on one completed repetition (a push-up, a pirouette…). */
export interface RepResult {
  n: number
  ok: boolean
  /** e.g. "Rep 3" or "Double". */
  title: string
  /** Corrections, most important first. Empty when the rep was clean. */
  faults: string[]
  /** Measurements, for transparency (e.g. "lowest elbow 84°"). */
  details: string[]
}

export interface MovementFeedback {
  /** Positioning guidance while the movement can't be tracked yet. */
  hint?: string
  headline: { tone: Tone; text: string }
  /** Current phase, e.g. "Lowering" or "Turning". */
  phase: string
  reps: RepResult[]
  /** Joints to colour on the skeleton right now. */
  joints: Map<number, CheckStatus>
  /** Something worth saying aloud this frame (a rep just finished). */
  say?: string
}

export interface MovementTracker {
  /** `now` is in ms on the movement's own clock (media time for uploaded videos). */
  update(frame: PoseFrame | null, now: number): MovementFeedback
}

export interface MovementDefinition {
  kind: 'movement'
  id: string
  name: string
  category: 'Ballet' | 'Yoga' | 'Strength'
  summary: string
  cameraTip: string
  cues: string[]
  illustration: Illustration
  /** What one repetition is called in the UI, e.g. "rep" or "turn". */
  unit: string
  createTracker(): MovementTracker
}
