import { L, SIDES, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angleFromVertical, dist2d } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import {
  LOWER_BODY,
  NOT_VISIBLE_HINT,
  SHOULDERS,
  armHeight,
  facingCameraHint,
  isVisible,
  legLength,
  miss,
  shouldersLevel,
  straightLeg,
  torsoUpright,
  jointAngle,
} from './common'

interface WarriorCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  front: SideIndices
  back: SideIndices
  /** +1 if the front leg is toward larger x. */
  outward: number
}

const kneeAngle = (frame: PoseFrame, s: SideIndices) => jointAngle(frame, s.hip, s.knee, s.ankle)

export const warrior2 = definePose<WarriorCtx>({
  id: 'warrior-2',
  name: 'Warrior II',
  category: 'Yoga',
  emoji: '⚔️',
  summary: 'A wide lunge with the front knee over the ankle, back leg straight and arms stretched out at shoulder height.',
  cameraTip: 'Face the camera with your feet wide, so your chest faces the lens. Keep your whole body in view.',
  cues: [
    'Front knee bent towards 90°, stacked over the ankle',
    'Back leg straight and strong',
    'Torso upright, centred between the legs',
    'Arms straight, at shoulder height',
    'Shoulders relaxed and level',
  ],

  prepare(frame) {
    if (!isVisible(frame, [...LOWER_BODY, ...SHOULDERS])) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const facing = facingCameraHint(img, 'Warrior II')
    if (facing) return { ready: false, hint: facing }
    const w = frame.world
    const [front, back] =
      kneeAngle(frame, SIDES.left) < kneeAngle(frame, SIDES.right) ? [SIDES.left, SIDES.right] : [SIDES.right, SIDES.left]
    const stance = dist2d(img[L.LEFT_ANKLE]!, img[L.RIGHT_ANKLE]!) / legLength(img, back)
    if (stance < 0.8 || kneeAngle(frame, front) > 155) {
      return { ready: false, hint: 'Step your feet wide and bend your front knee into Warrior II.' }
    }
    const outward = Math.sign(img[front.ankle]!.x - img[back.ankle]!.x) || 1
    return { ready: true, ctx: { frame, img, world: w, front, back, outward } }
  },

  checks: [
    {
      id: 'front-knee',
      label: 'Front knee bent to ~90°',
      evaluate({ frame, front }): CheckResult {
        const knee = kneeAngle(frame, front)
        const { status, direction } = grade(knee, { good: [80, 112], tolerance: 15 })
        return {
          status,
          detail: fmtDeg(knee),
          message:
            direction === 'high'
              ? 'Bend your front knee deeper, towards a right angle.'
              : "Don't sink past 90°: widen your stance a little.",
          joints: [front.hip, front.knee, front.ankle],
        }
      },
    },
    {
      id: 'knee-over-ankle',
      label: 'Front knee over the ankle',
      evaluate({ img, front, outward }): CheckResult {
        const shin = angleFromVertical(img[front.ankle]!, img[front.knee]!)
        const pastAnkle = (img[front.knee]!.x - img[front.ankle]!.x) * outward > 0
        return {
          status: grade(shin, { good: [0, 10], tolerance: 10 }).status,
          detail: `shin ${fmtDeg(shin)} from vertical`,
          message: pastAnkle
            ? 'Your front knee is past your ankle: widen your stance.'
            : 'Press your front knee out so it tracks over your ankle.',
          joints: [front.knee, front.ankle],
        }
      },
    },
    {
      id: 'back-leg',
      label: 'Back leg straight',
      evaluate: ({ frame, back }) =>
        straightLeg(frame, back, 'Straighten your back leg and press into the outer edge of the back foot.'),
    },
    {
      id: 'arm-height',
      label: 'Arms at shoulder height',
      evaluate: ({ frame }) =>
        armHeight(
          frame,
          { good: [-0.15, 0.15], tolerance: 0.1 },
          { tooLow: 'Lift your arms up to shoulder height.', tooHigh: 'Lower your arms to shoulder height.' },
        ),
    },
    {
      id: 'arms-straight',
      label: 'Arms straight',
      evaluate({ frame, world }): CheckResult {
        const arms = [SIDES.left, SIDES.right].filter((s) => isVisible(frame, [s.shoulder, s.elbow, s.wrist]))
        if (arms.length === 0) return { status: 'unknown', detail: 'arms not visible' }
        const angles = arms.map((s) => jointAngle(frame, s.shoulder, s.elbow, s.wrist))
        const band = { good: [160, 180] as [number, number], tolerance: 10 }
        const worst = angles.reduce((a, b) => (miss(b, band.good) > miss(a, band.good) ? b : a))
        return {
          status: grade(worst, band).status,
          detail: angles.map(fmtDeg).join(' / '),
          message: 'Reach long through your fingertips: straighten your arms.',
          joints: arms.flatMap((s) => [s.shoulder, s.elbow, s.wrist]),
        }
      },
    },
    {
      id: 'torso-upright',
      label: 'Torso upright and centred',
      evaluate: ({ img }) =>
        torsoUpright(img, "Keep your torso upright and centred: don't lean over your front knee."),
    },
    { id: 'shoulders-level', label: 'Shoulders level and relaxed', evaluate: ({ img }) => shouldersLevel(img) },
  ],
})
