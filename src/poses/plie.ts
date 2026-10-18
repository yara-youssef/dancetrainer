import { L, SIDES, type Point, type PoseFrame } from '@/pose/landmarks'
import { dist2d, midpoint } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import {
  LOWER_BODY,
  NOT_VISIBLE_HINT,
  SHOULDERS,
  armHeight,
  facingCameraHint,
  hipsLevel,
  isVisible,
  legLength,
  miss,
  roundedArms,
  toePoint,
  torsoUpright,
  jointAngle,
} from './common'

interface PlieCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
}

const kneeAngles = (frame: PoseFrame) =>
  [SIDES.left, SIDES.right].map((s) => jointAngle(frame, s.hip, s.knee, s.ankle))

export const plie = definePose<PlieCtx>({
  id: 'plie-second',
  name: 'Plié in second',
  category: 'Ballet',
  summary: 'Feet wide and turned out, knees bending open over the toes with an upright spine.',
  cameraTip: 'Face the camera, about 2–3 m away, with your whole body (feet included) in view.',
  cues: [
    'Feet wide apart and turned out',
    'Knees bend open, directly over the toes',
    'Spine upright, pelvis level',
    'Arms open in second, just below shoulder height',
  ],

  illustration: {
    view: 'front',
    points: {
      [L.NOSE]: [0.5, 0.18],
      [L.LEFT_EAR]: [0.53, 0.17],
      [L.RIGHT_EAR]: [0.47, 0.17],
      [L.LEFT_SHOULDER]: [0.58, 0.27],
      [L.RIGHT_SHOULDER]: [0.42, 0.27],
      [L.LEFT_ELBOW]: [0.68, 0.32],
      [L.RIGHT_ELBOW]: [0.32, 0.32],
      [L.LEFT_WRIST]: [0.76, 0.39],
      [L.RIGHT_WRIST]: [0.24, 0.39],
      [L.LEFT_INDEX]: [0.79, 0.41],
      [L.RIGHT_INDEX]: [0.21, 0.41],
      [L.LEFT_HIP]: [0.55, 0.55],
      [L.RIGHT_HIP]: [0.45, 0.55],
      [L.LEFT_KNEE]: [0.68, 0.7],
      [L.RIGHT_KNEE]: [0.32, 0.7],
      [L.LEFT_ANKLE]: [0.68, 0.88],
      [L.RIGHT_ANKLE]: [0.32, 0.88],
      [L.LEFT_HEEL]: [0.66, 0.9],
      [L.RIGHT_HEEL]: [0.34, 0.9],
      [L.LEFT_FOOT_INDEX]: [0.73, 0.9],
      [L.RIGHT_FOOT_INDEX]: [0.27, 0.9],
    },
  },

  prepare(frame) {
    if (!isVisible(frame, [...LOWER_BODY, ...SHOULDERS])) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const facing = facingCameraHint(img, 'plié')
    if (facing) return { ready: false, hint: facing }
    const shoulderWidth = dist2d(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
    const stance = dist2d(img[L.LEFT_ANKLE]!, img[L.RIGHT_ANKLE]!)
    const feetDown = Math.abs(img[L.LEFT_ANKLE]!.y - img[L.RIGHT_ANKLE]!.y) / legLength(img, SIDES.left) < 0.12
    if (!feetDown || stance < shoulderWidth) {
      return { ready: false, hint: 'Step your feet wide apart into second position.' }
    }
    if (Math.max(...kneeAngles(frame)) > 168) {
      return { ready: false, hint: 'Bend your knees into a plié.' }
    }
    return { ready: true, ctx: { frame, img, world: frame.world } }
  },

  checks: [
    {
      id: 'depth',
      label: 'Knees bent evenly',
      evaluate({ frame }): CheckResult {
        const angles = kneeAngles(frame)
        const band = { good: [90, 150] as [number, number], tolerance: 12 }
        const worst = angles.reduce((a, b) => (miss(b, band.good) > miss(a, band.good) ? b : a))
        const { status, direction } = grade(worst, band)
        return {
          status,
          detail: angles.map(fmtDeg).join(' / '),
          message: direction === 'high' ? 'Bend a little deeper.' : 'Come up a little: keep your heels on the floor.',
          joints: [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE, L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
        }
      },
    },
    {
      id: 'knees-over-toes',
      label: 'Knees over toes',
      evaluate({ img }): CheckResult {
        const offsets = (['left', 'right'] as const).map((side) => {
          const s = SIDES[side]
          const other = SIDES[side === 'left' ? 'right' : 'left']
          const outward = Math.sign(img[s.hip]!.x - img[other.hip]!.x) || 1
          const shin = dist2d(img[s.knee]!, img[s.ankle]!)
          // Turned-out feet point sideways: the knee should track over the middle of the foot.
          const foot = midpoint(img[s.ankle]!, toePoint(img, s))
          return ((img[s.knee]!.x - foot.x) * outward) / shin
        })
        // Negative = knee falls inside the toes (rolling in).
        const worst = Math.min(...offsets)
        return {
          status: grade(worst, { good: [-0.15, 10], tolerance: 0.15 }).status,
          detail: worst < 0 ? 'knees inside toes' : 'knees over toes',
          message: 'Push your knees out over your toes: turn out from the hips.',
          joints: [L.LEFT_KNEE, L.LEFT_FOOT_INDEX, L.RIGHT_KNEE, L.RIGHT_FOOT_INDEX],
        }
      },
    },
    {
      id: 'width',
      label: 'Second position width',
      evaluate({ img }): CheckResult {
        const ratio =
          dist2d(img[L.LEFT_ANKLE]!, img[L.RIGHT_ANKLE]!) / dist2d(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
        const { status, direction } = grade(ratio, { good: [1.3, 2.6], tolerance: 0.3 })
        return {
          status,
          detail: `${ratio.toFixed(1)}× shoulder width`,
          message: direction === 'low' ? 'Widen your second position a little.' : 'Bring your feet a little closer together.',
          joints: [L.LEFT_ANKLE, L.RIGHT_ANKLE],
        }
      },
    },
    {
      id: 'torso-upright',
      label: 'Spine upright',
      evaluate: ({ img }) => torsoUpright(img, 'Keep your spine upright: sit straight down, not forward.'),
    },
    { id: 'hips-level', label: 'Pelvis level', evaluate: ({ img }) => hipsLevel(img) },
    {
      id: 'arm-height',
      label: 'Arms in second',
      evaluate: ({ frame }) =>
        armHeight(
          frame,
          { good: [0, 0.45], tolerance: 0.15 },
          {
            tooLow: 'Lift your arms to just below shoulder height.',
            tooHigh: 'Lower your arms slightly, just below the shoulders.',
          },
        ),
    },
    {
      id: 'rounded-arms',
      label: 'Arms softly rounded',
      evaluate: ({ frame }) => roundedArms(frame, { good: [125, 172], tolerance: 8 }),
    },
  ],
})
