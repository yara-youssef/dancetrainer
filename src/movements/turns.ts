import { L, SIDES, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angleFromVertical, dist2d, midpoint } from '@/pose/geometry'
import { Smoother } from '@/pose/engine'
import type { CheckStatus } from '@/poses/types'
import { LOWER_BODY, NOT_VISIBLE_HINT, isVisible, legLength, torsoLength } from '@/poses/common'
import type { MovementFeedback, MovementTracker, RepResult } from './types'

type Facing = 'front' | 'side' | 'away'

/** Time facing the camera again before the turn counts as finished. */
const SETTLE_MS = 250
/** Time after the turn over which the landing's steadiness is judged. */
const LANDING_MS = 700

/** Measurements of one frame, shared by all turn types. */
export interface TurnFrame {
  frame: PoseFrame
  working: SideIndices
  standing: SideIndices
  /** Working ankle height above the standing ankle, in leg lengths. */
  lift: number
  /** Torso tilt away from vertical, in degrees (forward, back or sideways). */
  tilt: number
}

export interface TurnCheck {
  /** Shown in the rep details, e.g. "passé held". */
  label: string
  /** Correction when this held for less than 70% of the turn. */
  fault: string
  pass(f: TurnFrame): boolean
}

export interface TurnConfig {
  /** True when the dancer is in the shape that a turn of this kind starts from. */
  canStart(f: TurnFrame): boolean
  /** Checked on every frame of the turn, in priority order. */
  checks: TurnCheck[]
  readyHint: string
}

interface TurnStats {
  start: number
  /** Completed rotations: one per time the dancer faced away. */
  rotations: number
  frames: number
  passed: number[]
}

interface Landing {
  since: number
  hipX: number[]
}

/** Which way the dancer faces, from face visibility and the left/right order of the shoulders. */
export function facingOf(frame: PoseFrame, frontSign: number | null): Facing {
  const img = frame.image
  const nose = img[L.NOSE]!.visibility ?? 1
  const dx = img[L.LEFT_SHOULDER]!.x - img[L.RIGHT_SHOULDER]!.x
  const width = Math.abs(dx) / (torsoLength(img) || 1)
  if (nose < 0.35) return 'away'
  if (width < 0.3) return 'side'
  // The shoulders swap sides in the image when the dancer faces away.
  if (frontSign !== null && Math.sign(dx) !== frontSign) return 'away'
  return 'front'
}

/**
 * Torso tilt from vertical. Uses the larger of the 2D and 3D estimates: leaning
 * towards the camera barely shows in 2D, while 3D depth is noisy for small tilts.
 */
export function torsoTilt(frame: PoseFrame): number {
  const img = frame.image
  const w = frame.world
  const tilt2d = angleFromVertical(midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!), midpoint(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!))
  const hips = midpoint(w[L.LEFT_HIP]!, w[L.RIGHT_HIP]!)
  const shoulders = midpoint(w[L.LEFT_SHOULDER]!, w[L.RIGHT_SHOULDER]!)
  const v = [shoulders.x - hips.x, shoulders.y - hips.y, shoulders.z - hips.z]
  const len = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
  const tilt3d = (Math.acos(Math.min(1, Math.max(-1, -v[1]! / len))) * 180) / Math.PI
  return Math.max(tilt2d, tilt3d)
}

/** Counts rotations and judges each turn against a turn type's checks. */
export class TurnTracker implements MovementTracker {
  private smoother = new Smoother(0.75)
  private reps: RepResult[] = []
  private frontSign: number | null = null
  private legLen = 0
  private turn: TurnStats | null = null
  private lastFacing: Facing = 'front'
  private frontSince: number | null = null
  private landing: Landing | null = null

  constructor(private cfg: TurnConfig) {}

  update(raw: PoseFrame | null, now: number): MovementFeedback {
    const joints = new Map<number, CheckStatus>()
    const base = { reps: this.reps, joints }
    if (!raw) {
      this.smoother.reset()
      // Losing the dancer mid-turn (motion blur) is normal; only reset when idle.
      if (!this.turn) return { ...base, phase: 'Waiting', hint: 'Step into view of the camera.', headline: info('Step into view of the camera.') }
      return { ...base, phase: 'Turning', headline: info('Turning…') }
    }
    const frame = this.smoother.push(raw)
    const img = frame.image
    const legsVisible = isVisible(frame, LOWER_BODY, 0.3)

    const facing = facingOf(frame, this.frontSign)
    const f: TurnFrame = { frame, ...legs(frame, this.legLen), tilt: torsoTilt(frame) }

    // Learn the dancer's size and front orientation while they face the camera.
    if (!this.turn && facing === 'front' && legsVisible && (img[L.NOSE]!.visibility ?? 1) > 0.7) {
      this.frontSign = Math.sign(img[L.LEFT_SHOULDER]!.x - img[L.RIGHT_SHOULDER]!.x) || 1
      this.legLen = Math.max(legLength(img, SIDES.left), legLength(img, SIDES.right))
    }
    if (!this.turn && (!legsVisible || this.legLen === 0)) {
      return { ...base, phase: 'Waiting', hint: NOT_VISIBLE_HINT, headline: info(NOT_VISIBLE_HINT) }
    }

    let say: string | undefined

    if (!this.turn && facing !== 'front' && this.cfg.canStart(f)) {
      this.turn = { start: now, rotations: 0, frames: 0, passed: this.cfg.checks.map(() => 0) }
      this.landing = null
    }

    // Never left the turn properly (walked off, sat down…): forget it.
    if (this.turn && now - this.turn.start > 10_000) {
      this.turn = null
      this.landing = null
    }

    if (this.turn) {
      const t = this.turn
      if (facing === 'away' && this.lastFacing !== 'away') t.rotations++

      if (facing === 'front') {
        this.frontSince ??= now
        if (now - this.frontSince >= SETTLE_MS) {
          this.landing ??= { since: now, hipX: [] }
          const hips = midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!)
          this.landing.hipX.push(hips.x / this.legLen)
          if (now - this.landing.since >= LANDING_MS) {
            const result = this.finish(t, this.landing)
            if (result) {
              this.reps.push(result)
              say = result.ok ? `${result.title}! Clean.` : `${result.title}. ${result.faults[0]}`
            }
            this.turn = null
            this.landing = null
          }
        }
      } else {
        this.frontSince = null
        this.landing = null
        if (legsVisible) {
          t.frames++
          this.cfg.checks.forEach((c, i) => {
            if (c.pass(f)) t.passed[i]!++
          })
        }
      }
    } else {
      this.frontSince = null
    }
    this.lastFacing = facing

    const last = this.reps.at(-1)
    const phase = this.turn ? (this.landing ? 'Landing' : 'Turning') : 'Ready'
    const headline = this.turn
      ? info(this.landing ? 'Hold the finish…' : `Turning… ${this.turn.rotations > 0 ? this.turn.rotations : ''}`.trim())
      : last
        ? { tone: last.ok ? ('good' as const) : ('warn' as const), text: last.ok ? `${last.title} ✓` : `${last.title}: ${last.faults[0]}` }
        : info(this.cfg.readyHint)
    return { ...base, phase, headline, say }
  }

  private finish(t: TurnStats, landing: Landing): RepResult | null {
    if (t.rotations === 0) return null // turned partway and came back: not a full turn
    const frac = (k: number) => (t.frames ? k / t.frames : 1)
    const faults = this.cfg.checks.filter((_, i) => frac(t.passed[i]!) < 0.7).map((c) => c.fault)
    const drift = spread(landing.hipX)
    if (drift > 0.04) faults.push('Control the landing: finish in a steady position.')
    return {
      n: this.reps.length + 1,
      ok: faults.length === 0,
      title: turnName(t.rotations),
      faults,
      details: [
        ...this.cfg.checks.map((c, i) => `${c.label} ${Math.round(frac(t.passed[i]!) * 100)}% of the turn`),
        `landing sway ${Math.round(drift * 100)}% of leg`,
      ],
    }
  }
}

/** The working leg is the one whose ankle is higher; `lift` is how much higher, in leg lengths. */
function legs(frame: PoseFrame, legLen: number): { working: SideIndices; standing: SideIndices; lift: number } {
  const img = frame.image
  const leftUp = img[L.LEFT_ANKLE]!.y < img[L.RIGHT_ANKLE]!.y
  const working = leftUp ? SIDES.left : SIDES.right
  const standing = leftUp ? SIDES.right : SIDES.left
  const len = legLen || dist2d(img[standing.hip]!, img[standing.ankle]!) || 1
  return { working, standing, lift: (img[standing.ankle]!.y - img[working.ankle]!.y) / len }
}

function spread(xs: number[]): number {
  if (xs.length === 0) return 0
  return Math.max(...xs) - Math.min(...xs)
}

export function turnName(rotations: number): string {
  return ['', 'Single', 'Double', 'Triple', 'Quadruple'][rotations] ?? `${rotations} turns`
}

const info = (text: string) => ({ tone: 'info' as const, text })
