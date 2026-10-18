import { L, SIDES, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angleFromVertical, dist2d, midpoint } from '@/pose/geometry'
import { Smoother } from '@/pose/engine'
import type { CheckStatus } from '@/poses/types'
import { LOWER_BODY, NOT_VISIBLE_HINT, isVisible, jointAngle, legLength, torsoLength } from '@/poses/common'
import type { MovementDefinition, MovementFeedback, MovementTracker, RepResult } from './types'

type Facing = 'front' | 'side' | 'away'

/** How far the working ankle must be above the standing ankle (in leg lengths) to count as passé. */
const PASSE_LIFT = 0.3
/** Time facing the camera again before the turn counts as finished. */
const SETTLE_MS = 250
/** Time after the turn over which the landing's steadiness is judged. */
const LANDING_MS = 700

interface TurnStats {
  start: number
  /** Completed rotations: one per time the dancer faced away. */
  rotations: number
  frames: number
  passeFrames: number
  straightFrames: number
  uprightFrames: number
  maxLean: number
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

class PirouetteTracker implements MovementTracker {
  private smoother = new Smoother(0.75)
  private reps: RepResult[] = []
  private frontSign: number | null = null
  private legLen = 0
  private turn: TurnStats | null = null
  private lastFacing: Facing = 'front'
  private frontSince: number | null = null
  private landing: Landing | null = null

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
    const { working, standing, lift } = legs(frame, this.legLen)

    // Learn the dancer's size and front orientation while they stand facing the camera.
    if (!this.turn && facing === 'front' && legsVisible && (img[L.NOSE]!.visibility ?? 1) > 0.7) {
      this.frontSign = Math.sign(img[L.LEFT_SHOULDER]!.x - img[L.RIGHT_SHOULDER]!.x) || 1
      this.legLen = Math.max(legLength(img, SIDES.left), legLength(img, SIDES.right))
    }
    if (!this.turn && (!legsVisible || this.legLen === 0)) {
      return { ...base, phase: 'Waiting', hint: NOT_VISIBLE_HINT, headline: info(NOT_VISIBLE_HINT) }
    }

    let say: string | undefined

    // Start: leaving the front while a foot is up in passé.
    if (!this.turn && facing !== 'front' && lift >= PASSE_LIFT * 0.7) {
      this.turn = { start: now, rotations: 0, frames: 0, passeFrames: 0, straightFrames: 0, uprightFrames: 0, maxLean: 0 }
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
          if (lift >= PASSE_LIFT) t.passeFrames++
          if (jointAngle(frame, standing.hip, standing.knee, standing.ankle) >= 155) t.straightFrames++
          const lean = angleFromVertical(
            midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!),
            midpoint(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!),
          )
          if (lean <= 12) t.uprightFrames++
          t.maxLean = Math.max(t.maxLean, lean)
        }
      }
    } else {
      this.frontSince = null
    }
    this.lastFacing = facing

    if (legsVisible) {
      const status: CheckStatus = lift >= PASSE_LIFT ? 'good' : 'unknown'
      joints.set(working.knee, status).set(working.ankle, status)
    }

    const last = this.reps.at(-1)
    const phase = this.turn ? (this.landing ? 'Landing' : 'Turning') : 'Ready'
    const headline = this.turn
      ? info(this.landing ? 'Hold the finish…' : `Turning… ${this.turn.rotations > 0 ? this.turn.rotations : ''}`.trim())
      : last
        ? { tone: last.ok ? ('good' as const) : ('warn' as const), text: last.ok ? `${last.title} ✓` : `${last.title}: ${last.faults[0]}` }
        : info('Face the camera, prepare, then turn in passé.')
    return { ...base, phase, headline, say }
  }

  private finish(t: TurnStats, landing: Landing): RepResult | null {
    if (t.rotations === 0) return null // turned partway and came back: not a pirouette
    const n = this.reps.length + 1
    const frac = (k: number) => (t.frames ? k / t.frames : 1)
    const faults: string[] = []
    if (frac(t.passeFrames) < 0.7) faults.push('Keep your passé up through the whole turn.')
    if (frac(t.straightFrames) < 0.7) faults.push('Keep your standing leg straight while you turn.')
    if (frac(t.uprightFrames) < 0.7) faults.push('Stay upright: stack your shoulders over your hips.')
    const drift = spread(landing.hipX)
    if (drift > 0.04) faults.push('Control the landing: finish in a steady position.')
    return {
      n,
      ok: faults.length === 0,
      title: turnName(t.rotations),
      faults,
      details: [
        `passé held ${Math.round(frac(t.passeFrames) * 100)}% of the turn`,
        `standing leg straight ${Math.round(frac(t.straightFrames) * 100)}%`,
        `max lean ${Math.round(t.maxLean)}°`,
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

export const pirouette: MovementDefinition = {
  kind: 'movement',
  id: 'pirouette',
  name: 'Pirouette',
  category: 'Ballet',
  unit: 'turn',
  summary: 'Counts your rotations and checks the passé, standing leg, alignment and landing of every turn.',
  cameraTip:
    'Face the camera, 3 m away, whole body in view. Phones: use the back camera, and good light helps with fast turns.',
  cues: [
    'Prepare facing the camera',
    'Snap up into passé on relevé',
    'Hold the passé for the whole turn',
    'Standing leg straight, body stacked and upright',
    'Finish facing the camera and hold the landing',
  ],
  illustration: {
    view: 'front',
    spin: true,
    points: {
      [L.NOSE]: [0.5, 0.11],
      [L.LEFT_EAR]: [0.53, 0.1],
      [L.RIGHT_EAR]: [0.47, 0.1],
      [L.LEFT_SHOULDER]: [0.58, 0.2],
      [L.RIGHT_SHOULDER]: [0.42, 0.2],
      [L.LEFT_ELBOW]: [0.65, 0.3],
      [L.RIGHT_ELBOW]: [0.35, 0.3],
      [L.LEFT_WRIST]: [0.56, 0.37],
      [L.RIGHT_WRIST]: [0.44, 0.37],
      [L.LEFT_INDEX]: [0.53, 0.38],
      [L.RIGHT_INDEX]: [0.47, 0.38],
      [L.LEFT_HIP]: [0.55, 0.5],
      [L.RIGHT_HIP]: [0.45, 0.5],
      [L.RIGHT_KNEE]: [0.45, 0.71],
      [L.RIGHT_ANKLE]: [0.45, 0.91],
      [L.RIGHT_HEEL]: [0.455, 0.93],
      [L.RIGHT_FOOT_INDEX]: [0.45, 0.98],
      [L.LEFT_KNEE]: [0.7, 0.61],
      [L.LEFT_ANKLE]: [0.52, 0.68],
      [L.LEFT_HEEL]: [0.53, 0.7],
      [L.LEFT_FOOT_INDEX]: [0.47, 0.71],
    },
  },
  createTracker: () => new PirouetteTracker(),
}
