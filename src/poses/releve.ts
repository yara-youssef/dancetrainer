import { L, SIDES, otherSide, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angle2d, angleFromHorizontal, angleFromVertical, dist2d } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import { NOT_VISIBLE_HINT, isVisible, legLength, nearSide, straightLeg } from './common'

interface ReleveCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  s: SideIndices
  /** +1 if the dancer faces toward larger x, -1 otherwise. */
  facing: number
}

/** Heel-to-toe angle above horizontal; 0 when the heel is not above the toes. */
function heelLift(img: Point[], s: SideIndices): number {
  return img[s.heel]!.y < img[s.foot]!.y ? angleFromHorizontal(img[s.heel]!, img[s.foot]!) : 0
}

export const releve = definePose<ReleveCtx>({
  id: 'releve',
  name: 'Relevé',
  category: 'Ballet',
  summary: 'Rise onto the balls of both feet with straight legs and the body stacked in one vertical line.',
  cameraTip: 'Stand side-on to the camera with the camera low (about knee height) so it sees your feet clearly.',
  cues: [
    'Heels lifted high, weight over the balls of the feet',
    'Knees straight and pulled up',
    'Shoulders over hips over feet: one vertical line',
    'Pelvis neutral: tailbone long, no arched back',
  ],

  illustration: {
    view: 'side',
    points: {
      [L.NOSE]: [0.47, 0.13],
      [L.LEFT_EAR]: [0.5, 0.12],
      [L.LEFT_SHOULDER]: [0.5, 0.2],
      [L.LEFT_ELBOW]: [0.46, 0.34],
      [L.LEFT_WRIST]: [0.44, 0.47],
      [L.LEFT_INDEX]: [0.45, 0.51],
      [L.LEFT_HIP]: [0.5, 0.5],
      [L.LEFT_KNEE]: [0.5, 0.7],
      [L.LEFT_ANKLE]: [0.5, 0.86],
      [L.LEFT_HEEL]: [0.53, 0.88],
      [L.LEFT_FOOT_INDEX]: [0.47, 0.94],
      [L.RIGHT_EAR]: [0.52, 0.12],
      [L.RIGHT_SHOULDER]: [0.52, 0.2],
      [L.RIGHT_ELBOW]: [0.48, 0.34],
      [L.RIGHT_WRIST]: [0.46, 0.47],
      [L.RIGHT_INDEX]: [0.47, 0.51],
      [L.RIGHT_HIP]: [0.52, 0.5],
      [L.RIGHT_KNEE]: [0.52, 0.7],
      [L.RIGHT_ANKLE]: [0.52, 0.86],
      [L.RIGHT_HEEL]: [0.55, 0.88],
      [L.RIGHT_FOOT_INDEX]: [0.49, 0.94],
    },
  },

  prepare(frame) {
    const s = SIDES[nearSide(frame)]
    if (!isVisible(frame, [s.shoulder, s.hip, s.knee, s.ankle, s.heel, s.foot])) {
      return { ready: false, hint: NOT_VISIBLE_HINT }
    }
    const img = frame.image
    const stance = dist2d(img[L.LEFT_ANKLE]!, img[L.RIGHT_ANKLE]!) / legLength(img, s)
    if (angleFromVertical(img[s.ankle]!, img[s.shoulder]!) > 30 || stance > 0.5) {
      return { ready: false, hint: 'Stand tall with your feet together, side-on to the camera.' }
    }
    if (heelLift(img, s) < 12) return { ready: false, hint: 'Rise up onto the balls of your feet.' }
    const facing = Math.sign(img[s.foot]!.x - img[s.heel]!.x) || 1
    return { ready: true, ctx: { frame, img, world: frame.world, s, facing } }
  },

  checks: [
    {
      id: 'height',
      label: 'High on the balls of the feet',
      evaluate({ img, s }): CheckResult {
        const lift = heelLift(img, s)
        return {
          status: grade(lift, { good: [40, 90], tolerance: 15 }).status,
          detail: fmtDeg(lift),
          message: 'Rise higher: lift your heels and press up over the balls of your feet.',
          joints: [s.ankle, s.heel, s.foot],
        }
      },
    },
    {
      id: 'knees',
      label: 'Knees straight',
      evaluate({ frame, s }): CheckResult {
        const near = straightLeg(frame, s, 'Straighten your knees and pull up through the thighs.')
        const far = SIDES[otherSide(nearSide(frame))]
        if (near.status !== 'good' || !isVisible(frame, [far.hip, far.knee, far.ankle])) return near
        return straightLeg(frame, far, near.message!)
      },
    },
    {
      id: 'vertical',
      label: 'Body stacked over the feet',
      evaluate({ img, s, facing }): CheckResult {
        const lean = angleFromVertical(img[s.ankle]!, img[s.shoulder]!)
        const forward = (img[s.shoulder]!.x - img[s.ankle]!.x) * facing > 0
        return {
          status: grade(lean, { good: [0, 6], tolerance: 5 }).status,
          detail: `${fmtDeg(lean)} ${forward ? 'forward' : 'back'}`,
          message: forward
            ? "You're tipping forward: lift up and stack your shoulders over your feet."
            : 'Bring your weight forward over the balls of your feet.',
          joints: [s.shoulder, s.hip, s.ankle],
        }
      },
    },
    {
      id: 'pelvis',
      label: 'Pelvis neutral',
      evaluate({ img, s, facing }): CheckResult {
        const shoulder = img[s.shoulder]!
        const hip = img[s.hip]!
        const knee = img[s.knee]!
        const line = angle2d(shoulder, hip, knee)
        const lineX = shoulder.x + ((knee.x - shoulder.x) * (hip.y - shoulder.y)) / (knee.y - shoulder.y || 1)
        const seatOut = (hip.x - lineX) * facing < 0
        return {
          status: grade(line, { good: [168, 180], tolerance: 8 }).status,
          detail: fmtDeg(line),
          message: seatOut
            ? "Lengthen your tailbone down: don't stick your seat out or arch your back."
            : "Don't push your hips forward: keep them under your shoulders.",
          joints: [s.shoulder, s.hip, s.knee],
        }
      },
    },
  ],
})
