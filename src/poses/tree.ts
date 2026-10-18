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
  shouldersLevel,
  straightLeg,
  toePoint,
  torsoUpright,
} from './common'
import { kneeTurnout } from './passe'

interface TreeCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  working: SideIndices
  standing: SideIndices
  legLength: number
}

export const tree = definePose<TreeCtx>({
  id: 'tree',
  name: 'Tree Pose',
  category: 'Yoga',
  summary: 'Balance on one leg with the other foot pressed into the inner thigh or calf, palms together.',
  cameraTip: 'Face the camera, about 2–3 m away, with your whole body (feet included) in view.',
  cues: [
    'Standing leg strong and straight',
    'Foot on the inner thigh or calf, never on the knee',
    'Bent knee opening out to the side',
    'Hips level, spine tall',
    'Palms together at the heart or overhead',
  ],

  illustration: {
    view: 'front',
    points: {
      [L.NOSE]: [0.5, 0.11],
      [L.LEFT_EAR]: [0.53, 0.1],
      [L.RIGHT_EAR]: [0.47, 0.1],
      [L.LEFT_SHOULDER]: [0.58, 0.2],
      [L.RIGHT_SHOULDER]: [0.42, 0.2],
      [L.LEFT_ELBOW]: [0.62, 0.36],
      [L.RIGHT_ELBOW]: [0.38, 0.36],
      [L.LEFT_WRIST]: [0.505, 0.33],
      [L.RIGHT_WRIST]: [0.495, 0.33],
      [L.LEFT_INDEX]: [0.503, 0.28],
      [L.RIGHT_INDEX]: [0.497, 0.28],
      [L.LEFT_HIP]: [0.55, 0.5],
      [L.RIGHT_HIP]: [0.45, 0.5],
      [L.RIGHT_KNEE]: [0.45, 0.72],
      [L.RIGHT_ANKLE]: [0.45, 0.94],
      [L.RIGHT_HEEL]: [0.45, 0.96],
      [L.RIGHT_FOOT_INDEX]: [0.43, 0.98],
      [L.LEFT_KNEE]: [0.72, 0.6],
      [L.LEFT_ANKLE]: [0.5, 0.55],
      [L.LEFT_HEEL]: [0.51, 0.53],
      [L.LEFT_FOOT_INDEX]: [0.47, 0.56],
    },
  },

  prepare(frame) {
    if (!isVisible(frame, [...LOWER_BODY, ...SHOULDERS])) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const facing = facingCameraHint(img, 'tree pose')
    if (facing) return { ready: false, hint: facing }
    const { working, standing } = oneLegSides(img)
    const length = legLength(img, standing)
    if ((img[standing.ankle]!.y - img[working.ankle]!.y) / length < 0.15) {
      return { ready: false, hint: 'Lift one foot and place it on your inner calf or thigh.' }
    }
    return { ready: true, ctx: { frame, img, world: frame.world, working, standing, legLength: length } }
  },

  checks: [
    {
      id: 'standing-leg',
      label: 'Standing leg straight',
      evaluate: ({ frame, standing }) =>
        straightLeg(frame, standing, 'Straighten your standing leg, without locking the knee.', {
          good: [165, 180],
          tolerance: 10,
        }),
    },
    {
      id: 'foot-placement',
      label: 'Foot off the knee joint',
      evaluate({ img, working, standing, legLength }): CheckResult {
        const drop = (toePoint(img, working).y - img[standing.knee]!.y) / legLength
        return {
          status: grade(Math.abs(drop), { good: [0.08, 10], tolerance: 0.04 }).status,
          detail: drop < 0 ? 'foot above knee' : 'foot below knee',
          message: 'Move your foot above or below your knee: never press on the joint.',
          joints: [working.ankle, working.foot, standing.knee],
        }
      },
    },
    {
      id: 'knee-open',
      label: 'Bent knee opening out',
      evaluate: ({ img, working, standing }) => ({
        ...kneeTurnout(img, working, standing),
        message: 'Open your bent knee out to the side.',
      }),
    },
    { id: 'hips-level', label: 'Hips level', evaluate: ({ img, working, standing }) => hipsLevel(img, working, standing) },
    { id: 'torso-upright', label: 'Spine tall', evaluate: ({ img }) => torsoUpright(img) },
    { id: 'shoulders-level', label: 'Shoulders level and relaxed', evaluate: ({ img }) => shouldersLevel(img) },
    {
      id: 'palms',
      label: 'Palms together',
      evaluate({ frame, img }): CheckResult {
        if (!isVisible(frame, [L.LEFT_WRIST, L.RIGHT_WRIST])) return { status: 'unknown', detail: 'hands not visible' }
        const gap =
          dist2d(img[L.LEFT_WRIST]!, img[L.RIGHT_WRIST]!) / dist2d(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
        return {
          status: grade(gap, { good: [0, 0.45], tolerance: 0.25 }).status,
          detail: `hands ${Math.round(gap * 100)}% of shoulder width apart`,
          message: 'Bring your palms together at your heart or overhead.',
          joints: [L.LEFT_ELBOW, L.LEFT_WRIST, L.RIGHT_ELBOW, L.RIGHT_WRIST],
        }
      },
    },
  ],
})
