import { L, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { dist2d } from '@/pose/geometry'
import { definePose, grade, type CheckResult } from './types'
import {
  LOWER_BODY,
  NOT_VISIBLE_HINT,
  SHOULDERS,
  facingCameraHint,
  hipsLevel,
  isVisible,
  legLength,
  oneLegSides,
  pointedFoot,
  roundedArms,
  shouldersLevel,
  straightLeg,
  toePoint,
  torsoUpright,
} from './common'

interface PasseCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  working: SideIndices
  standing: SideIndices
  /** Standing-leg length in image units, used to normalise distances. */
  legLength: number
}

export const passe = definePose<PasseCtx>({
  id: 'passe',
  name: 'Passé (retiré)',
  category: 'Ballet',
  summary: 'Balance on one leg with the working toe drawn up to the standing knee, knee turned out.',
  cameraTip: 'Face the camera, about 2–3 m away, with your whole body (feet included) in view.',
  cues: [
    'Standing leg pulled up and straight',
    'Working toe at the side of the standing knee',
    'Working knee opened out to the side (turnout)',
    'Working foot pointed',
    'Hips and shoulders square and level',
    'Arms softly rounded',
  ],

  illustration: {
    view: 'front',
    points: {
      [L.NOSE]: [0.5, 0.11],
      [L.LEFT_EAR]: [0.53, 0.1],
      [L.RIGHT_EAR]: [0.47, 0.1],
      [L.LEFT_SHOULDER]: [0.58, 0.2],
      [L.RIGHT_SHOULDER]: [0.42, 0.2],
      [L.LEFT_ELBOW]: [0.64, 0.33],
      [L.RIGHT_ELBOW]: [0.36, 0.33],
      [L.LEFT_WRIST]: [0.57, 0.44],
      [L.RIGHT_WRIST]: [0.43, 0.44],
      [L.LEFT_INDEX]: [0.54, 0.46],
      [L.RIGHT_INDEX]: [0.46, 0.46],
      [L.LEFT_HIP]: [0.55, 0.5],
      [L.RIGHT_HIP]: [0.45, 0.5],
      [L.RIGHT_KNEE]: [0.45, 0.72],
      [L.RIGHT_ANKLE]: [0.45, 0.94],
      [L.RIGHT_HEEL]: [0.46, 0.96],
      [L.RIGHT_FOOT_INDEX]: [0.4, 0.97],
      [L.LEFT_KNEE]: [0.7, 0.62],
      [L.LEFT_ANKLE]: [0.52, 0.69],
      [L.LEFT_HEEL]: [0.53, 0.71],
      [L.LEFT_FOOT_INDEX]: [0.47, 0.72],
    },
  },

  prepare(frame) {
    if (!isVisible(frame, [...LOWER_BODY, ...SHOULDERS])) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const facing = facingCameraHint(img, 'passé')
    if (facing) return { ready: false, hint: facing }

    const { working, standing } = oneLegSides(img)
    const length = legLength(img, standing)
    const lift = (img[standing.ankle]!.y - img[working.ankle]!.y) / length
    if (lift < 0.2) {
      return { ready: false, hint: 'Draw one foot up your standing leg to your knee.' }
    }
    return { ready: true, ctx: { frame, img, world: frame.world, working, standing, legLength: length } }
  },

  checks: [
    {
      id: 'standing-leg',
      label: 'Standing leg straight',
      evaluate: ({ frame, standing }) =>
        straightLeg(frame, standing, 'Straighten your standing leg: pull up through the knee.'),
    },
    {
      id: 'passe-height',
      label: 'Toe at the standing knee',
      evaluate({ img, working, standing, legLength }): CheckResult {
        const toe = toePoint(img, working)
        // Positive = toe is below the standing knee.
        const drop = (toe.y - img[standing.knee]!.y) / legLength
        const { status, direction } = grade(drop, { good: [-0.12, 0.07], tolerance: 0.07 })
        return {
          status,
          detail: `${Math.round(Math.abs(drop) * 100)}% of leg ${drop >= 0 ? 'below' : 'above'} knee`,
          message:
            direction === 'high'
              ? 'Lift your working knee higher: bring your toe up to your standing knee.'
              : 'Your foot is a bit high: the toe should sit at the knee.',
          joints: [working.knee, working.ankle, working.foot, standing.knee],
        }
      },
    },
    {
      id: 'turnout',
      label: 'Working knee turned out',
      evaluate: ({ img, working, standing }) => kneeTurnout(img, working, standing),
    },
    {
      id: 'pointed-foot',
      label: 'Working foot pointed',
      evaluate: ({ frame, working }) =>
        pointedFoot(frame, working, 'Point your working foot: stretch through the arch and toes.'),
    },
    { id: 'hips-level', label: 'Hips level', evaluate: ({ img, working, standing }) => hipsLevel(img, working, standing) },
    { id: 'torso-upright', label: 'Torso upright', evaluate: ({ img }) => torsoUpright(img) },
    { id: 'shoulders-level', label: 'Shoulders level and down', evaluate: ({ img }) => shouldersLevel(img) },
    { id: 'rounded-arms', label: 'Arms softly rounded', evaluate: ({ frame }) => roundedArms(frame) },
  ],
})

/** Front view: how far the bent working knee opens out to the side. */
export function kneeTurnout(img: Point[], working: SideIndices, standing: SideIndices): CheckResult {
  const outward = Math.sign(img[working.hip]!.x - img[standing.hip]!.x) || 1
  const thigh = dist2d(img[standing.hip]!, img[standing.knee]!)
  const open = ((img[working.knee]!.x - img[working.hip]!.x) * outward) / thigh
  return {
    status: grade(open, { good: [0.5, 5], tolerance: 0.18 }).status,
    detail: `knee ${Math.round(open * 100)}% of a thigh out to the side`,
    message: 'Open your working knee out to the side: rotate from the hip.',
    joints: [working.hip, working.knee],
  }
}
