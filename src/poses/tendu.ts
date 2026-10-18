import { L, SIDES, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angleFromVertical, midpoint } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import {
  LOWER_BODY,
  NOT_VISIBLE_HINT,
  SHOULDERS,
  armHeight,
  facingCameraHint,
  hipsLevel,
  isVisible,
  jointAngle,
  legLength,
  pointedFoot,
  shouldersLevel,
  straightLeg,
  torsoUpright,
} from './common'

interface TenduCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  working: SideIndices
  standing: SideIndices
}

export const tendu = definePose<TenduCtx>({
  id: 'tendu',
  name: 'Tendu à la seconde',
  category: 'Ballet',
  summary: 'Weight on one straight leg, the other stretched out to the side with a fully pointed foot.',
  cameraTip: 'Face the camera, about 2–3 m away, with your whole body (feet included) in view.',
  cues: [
    'Weight fully over the standing leg',
    'Both knees straight',
    'Working foot stretched out to the side, pointed',
    'Hips and shoulders level',
    'Arms open in second',
  ],

  illustration: {
    view: 'front',
    points: {
      [L.NOSE]: [0.5, 0.11],
      [L.LEFT_EAR]: [0.53, 0.1],
      [L.RIGHT_EAR]: [0.47, 0.1],
      [L.LEFT_SHOULDER]: [0.58, 0.2],
      [L.RIGHT_SHOULDER]: [0.42, 0.2],
      [L.LEFT_ELBOW]: [0.68, 0.25],
      [L.RIGHT_ELBOW]: [0.32, 0.25],
      [L.LEFT_WRIST]: [0.76, 0.32],
      [L.RIGHT_WRIST]: [0.24, 0.32],
      [L.LEFT_INDEX]: [0.79, 0.34],
      [L.RIGHT_INDEX]: [0.21, 0.34],
      [L.LEFT_HIP]: [0.55, 0.5],
      [L.RIGHT_HIP]: [0.45, 0.5],
      [L.RIGHT_KNEE]: [0.45, 0.72],
      [L.RIGHT_ANKLE]: [0.45, 0.94],
      [L.RIGHT_HEEL]: [0.46, 0.96],
      [L.RIGHT_FOOT_INDEX]: [0.4, 0.97],
      [L.LEFT_KNEE]: [0.63, 0.71],
      [L.LEFT_ANKLE]: [0.71, 0.92],
      [L.LEFT_HEEL]: [0.7, 0.93],
      [L.LEFT_FOOT_INDEX]: [0.73, 0.97],
    },
  },

  prepare(frame) {
    if (!isVisible(frame, [...LOWER_BODY, ...SHOULDERS])) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const facing = facingCameraHint(img, 'tendu')
    if (facing) return { ready: false, hint: facing }
    const tilt = (s: SideIndices) => angleFromVertical(img[s.hip]!, img[s.ankle]!)
    const [working, standing] =
      tilt(SIDES.left) > tilt(SIDES.right) ? [SIDES.left, SIDES.right] : [SIDES.right, SIDES.left]
    const bent = (s: SideIndices) => jointAngle(frame, s.hip, s.knee, s.ankle) < 145
    if (bent(working) || bent(standing)) {
      return { ready: false, hint: 'Straighten both legs and slide one foot out to the side.' }
    }
    if (tilt(working) < 15) return { ready: false, hint: 'Slide one foot out to the side into a tendu.' }
    return { ready: true, ctx: { frame, img, world: frame.world, working, standing } }
  },

  checks: [
    {
      id: 'standing-leg',
      label: 'Standing leg straight',
      evaluate: ({ frame, standing }) =>
        straightLeg(frame, standing, 'Straighten your standing leg: pull up through the knee.'),
    },
    {
      id: 'working-leg',
      label: 'Working leg stretched',
      evaluate: ({ frame, working }) =>
        straightLeg(frame, working, 'Stretch your working knee fully.', { good: [165, 180], tolerance: 9 }),
    },
    {
      id: 'pointed-foot',
      label: 'Working foot pointed',
      evaluate: ({ frame, working }) =>
        pointedFoot(frame, working, 'Point your working foot: push the floor away through the toes.'),
    },
    {
      id: 'extension',
      label: 'Foot extended to the side',
      evaluate({ img, working }): CheckResult {
        const angle = angleFromVertical(img[working.hip]!, img[working.ankle]!)
        const { status, direction } = grade(angle, { good: [20, 50], tolerance: 10 })
        return {
          status,
          detail: fmtDeg(angle),
          message:
            direction === 'low'
              ? 'Slide your foot further out to the side, until only the toes touch the floor.'
              : 'Keep your toes on (or just off) the floor.',
          joints: [working.hip, working.knee, working.ankle],
        }
      },
    },
    {
      id: 'weight',
      label: 'Weight over the standing leg',
      evaluate({ img, working, standing }): CheckResult {
        const hips = midpoint(img[working.hip]!, img[standing.hip]!)
        const offset = Math.abs(hips.x - img[standing.ankle]!.x) / legLength(img, standing)
        return {
          status: grade(offset, { good: [0, 0.15], tolerance: 0.08 }).status,
          detail: `${Math.round(offset * 100)}% of leg off centre`,
          message: 'Shift your weight over your standing leg.',
          joints: [working.hip, standing.hip, standing.ankle],
        }
      },
    },
    { id: 'hips-level', label: 'Hips level', evaluate: ({ img, working, standing }) => hipsLevel(img, working, standing) },
    { id: 'torso-upright', label: 'Torso upright', evaluate: ({ img }) => torsoUpright(img) },
    { id: 'shoulders-level', label: 'Shoulders level and down', evaluate: ({ img }) => shouldersLevel(img) },
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
  ],
})
