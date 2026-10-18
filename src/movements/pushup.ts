import { L, SIDES, type PoseFrame } from '@/pose/landmarks'
import { angle2d, angleFromHorizontal, offsetBelowLine } from '@/pose/geometry'
import { Smoother } from '@/pose/engine'
import type { CheckStatus } from '@/poses/types'
import { NOT_VISIBLE_HINT, isVisible, jointAngle, nearSide } from '@/poses/common'
import type { MovementDefinition, MovementFeedback, MovementTracker, RepResult } from './types'

/** Elbow angle above which the arms count as extended (top of the push-up). */
const TOP = 150
/** Elbow angle below which the push-up counts as started. */
const STARTED = 140
/** Lowest elbow angle that counts as full depth. */
const DEPTH = 100

interface RepStats {
  start: number
  minElbow: number
  /** Most bent shoulder–hip–ankle angle seen, and whether the hips were low at that moment. */
  worstLine: number
  sagged: boolean
}

class PushupTracker implements MovementTracker {
  private smoother = new Smoother(0.6)
  private reps: RepResult[] = []
  private rep: RepStats | null = null

  update(raw: PoseFrame | null, now: number): MovementFeedback {
    const base = { reps: this.reps, joints: new Map<number, CheckStatus>() }
    if (!raw) {
      this.smoother.reset()
      return { ...base, hint: 'Step into view of the camera.', phase: 'Waiting', headline: info('Step into view of the camera.') }
    }
    const frame = this.smoother.push(raw)
    const img = frame.image
    const s = SIDES[nearSide(frame)]
    if (!isVisible(frame, [s.shoulder, s.elbow, s.wrist, s.hip, s.ankle])) {
      return { ...base, hint: NOT_VISIBLE_HINT, phase: 'Waiting', headline: info(NOT_VISIBLE_HINT) }
    }
    const horizontal = angleFromHorizontal(img[s.shoulder]!, img[s.ankle]!) < 40
    const handsDown = img[s.wrist]!.y > img[s.shoulder]!.y
    if (!horizontal || !handsDown) {
      this.rep = null
      const hint = 'Get into a plank, side-on to the camera, to start your push-ups.'
      return { ...base, hint, phase: 'Waiting', headline: info(hint) }
    }

    const elbow = jointAngle(frame, s.shoulder, s.elbow, s.wrist)
    const line = angle2d(img[s.shoulder]!, img[s.hip]!, img[s.ankle]!)
    const sagging = offsetBelowLine(img[s.hip]!, img[s.shoulder]!, img[s.ankle]!) > 0
    const lineBad = line < 160
    if (lineBad) base.joints.set(s.hip, 'bad').set(s.shoulder, 'bad').set(s.ankle, 'bad')
    else base.joints.set(s.hip, 'good').set(s.shoulder, 'good').set(s.ankle, 'good')

    let say: string | undefined
    if (!this.rep && elbow < STARTED) {
      this.rep = { start: now, minElbow: elbow, worstLine: line, sagged: sagging }
    } else if (this.rep) {
      const r = this.rep
      if (elbow < r.minElbow) r.minElbow = elbow
      if (line < r.worstLine) {
        r.worstLine = line
        r.sagged = sagging
      }
      if (elbow >= TOP) {
        const result = judge(r, now, this.reps.length + 1)
        this.reps.push(result)
        this.rep = null
        say = result.ok ? `${result.n}` : `${result.n}. ${result.faults[0]}`
      }
    }

    const last = this.reps.at(-1)
    const phase = this.rep ? (elbow <= this.rep.minElbow + 3 ? 'Lowering' : 'Pushing up') : 'Top'
    const headline = lineBad
      ? { tone: 'bad' as const, text: sagging ? 'Hips sagging: brace your core!' : 'Hips too high: flatten out!' }
      : this.rep
        ? { tone: 'info' as const, text: phase === 'Lowering' ? 'Lower… chest towards the floor' : 'Push!' }
        : last
          ? { tone: last.ok ? ('good' as const) : ('warn' as const), text: last.ok ? `${last.n} ✓` : `${last.n}: ${last.faults[0]}` }
          : info('Ready: lower your chest towards the floor.')
    return { ...base, phase, headline, say }
  }
}

function judge(r: RepStats, now: number, n: number): RepResult {
  const faults: string[] = []
  if (r.minElbow > DEPTH) faults.push('Go lower: bend your elbows to about 90°.')
  if (r.worstLine < 160) {
    faults.push(r.sagged ? 'Your hips sagged: keep your core tight.' : 'Your hips piked up: keep a straight line.')
  }
  const seconds = (now - r.start) / 1000
  if (seconds < 0.8) faults.push('Slow down: control the way down.')
  return {
    n,
    ok: faults.length === 0,
    title: `Rep ${n}`,
    faults,
    details: [`lowest elbow ${Math.round(r.minElbow)}°`, `body line ${Math.round(r.worstLine)}°`, `${seconds.toFixed(1)}s`],
  }
}

const info = (text: string) => ({ tone: 'info' as const, text })

export const pushup: MovementDefinition = {
  kind: 'movement',
  id: 'pushup',
  name: 'Push-up',
  category: 'Strength',
  unit: 'rep',
  summary: 'Counts your push-ups and checks each one for depth, a straight body line and control.',
  cameraTip: 'Put the camera at floor height to your side, so it sees you in profile from head to heels.',
  cues: [
    'Start in a high plank, hands under shoulders',
    'Lower until your elbows reach about 90°',
    'Keep one straight line from shoulders to heels',
    'Push all the way back up',
    'Control the way down: no dropping',
  ],
  illustration: {
    view: 'side',
    points: {
      [L.NOSE]: [0.21, 0.6],
      [L.LEFT_EAR]: [0.24, 0.58],
      [L.LEFT_SHOULDER]: [0.3, 0.6],
      [L.LEFT_ELBOW]: [0.3, 0.7],
      [L.LEFT_WRIST]: [0.3, 0.8],
      [L.LEFT_INDEX]: [0.26, 0.8],
      [L.LEFT_HIP]: [0.55, 0.65],
      [L.LEFT_KNEE]: [0.72, 0.685],
      [L.LEFT_ANKLE]: [0.88, 0.72],
      [L.LEFT_HEEL]: [0.89, 0.7],
      [L.LEFT_FOOT_INDEX]: [0.87, 0.8],
      [L.RIGHT_SHOULDER]: [0.32, 0.6],
      [L.RIGHT_ELBOW]: [0.32, 0.7],
      [L.RIGHT_WRIST]: [0.32, 0.8],
      [L.RIGHT_INDEX]: [0.28, 0.8],
      [L.RIGHT_HIP]: [0.57, 0.65],
      [L.RIGHT_KNEE]: [0.74, 0.685],
      [L.RIGHT_ANKLE]: [0.9, 0.72],
      [L.RIGHT_HEEL]: [0.91, 0.7],
      [L.RIGHT_FOOT_INDEX]: [0.89, 0.8],
    },
    ghost: {
      [L.NOSE]: [0.2, 0.73],
      [L.LEFT_EAR]: [0.24, 0.71],
      [L.LEFT_SHOULDER]: [0.31, 0.73],
      [L.LEFT_ELBOW]: [0.38, 0.7],
      [L.LEFT_WRIST]: [0.3, 0.8],
      [L.LEFT_INDEX]: [0.26, 0.8],
      [L.LEFT_HIP]: [0.56, 0.75],
      [L.LEFT_KNEE]: [0.72, 0.765],
      [L.LEFT_ANKLE]: [0.88, 0.775],
      [L.LEFT_HEEL]: [0.89, 0.755],
      [L.LEFT_FOOT_INDEX]: [0.87, 0.8],
      [L.RIGHT_SHOULDER]: [0.33, 0.73],
      [L.RIGHT_HIP]: [0.58, 0.75],
    },
  },
  createTracker: () => new PushupTracker(),
}
