import { L, SIDES, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angleFromVertical, midpoint } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import {
  LOWER_BODY,
  NOT_VISIBLE_HINT,
  isVisible,
  jointAngle,
  legLength,
  nearSide,
  pointedFoot,
  straightLeg,
  torsoLength,
} from './common'

interface AttitudeCtx {
  frame: PoseFrame
  img: Point[]
  working: SideIndices
  standing: SideIndices
  near: SideIndices
  legLength: number
}

const DEG = 180 / Math.PI

export const attitude = definePose<AttitudeCtx>({
  id: 'attitude',
  name: 'Attitude derrière',
  category: 'Ballet',
  summary: 'Balance on one leg with the other lifted behind you, knee bent and held higher than the foot.',
  cameraTip: 'Stand side-on to the camera, 2–3 m away, so it sees your profile from head to back foot.',
  cues: [
    'Standing leg pulled up and straight',
    'Back knee bent to a soft curve (about 90–120°)',
    'Knee lifted to hip height, higher than the foot',
    'Foot pointed',
    'Chest lifted',
    'One arm up (en haut)',
  ],
  illustration: {
    view: 'side',
    points: {
      [L.NOSE]: [0.39, 0.16],
      [L.LEFT_EAR]: [0.41, 0.15],
      [L.RIGHT_EAR]: [0.42, 0.15],
      [L.LEFT_SHOULDER]: [0.43, 0.22],
      [L.RIGHT_SHOULDER]: [0.44, 0.22],
      [L.LEFT_ELBOW]: [0.38, 0.1],
      [L.LEFT_WRIST]: [0.44, 0.02],
      [L.LEFT_INDEX]: [0.48, 0.01],
      [L.RIGHT_ELBOW]: [0.5, 0.26],
      [L.RIGHT_WRIST]: [0.58, 0.28],
      [L.RIGHT_INDEX]: [0.62, 0.29],
      [L.RIGHT_HIP]: [0.5, 0.5],
      [L.RIGHT_KNEE]: [0.5, 0.72],
      [L.RIGHT_ANKLE]: [0.5, 0.94],
      [L.RIGHT_HEEL]: [0.51, 0.96],
      [L.RIGHT_FOOT_INDEX]: [0.45, 0.97],
      [L.LEFT_HIP]: [0.51, 0.5],
      [L.LEFT_KNEE]: [0.7, 0.4],
      [L.LEFT_ANKLE]: [0.86, 0.52],
      [L.LEFT_HEEL]: [0.85, 0.5],
      [L.LEFT_FOOT_INDEX]: [0.9, 0.55],
    },
  },

  prepare(frame) {
    if (!isVisible(frame, LOWER_BODY, 0.3)) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const workingSide = img[SIDES.left.ankle]!.y < img[SIDES.right.ankle]!.y ? 'left' : 'right'
    const working = SIDES[workingSide]
    const standing = SIDES[workingSide === 'left' ? 'right' : 'left']
    const length = legLength(img, standing)
    const hips = midpoint(img[working.hip]!, img[standing.hip]!)
    const lift = (img[standing.ankle]!.y - img[working.ankle]!.y) / length
    const reach = Math.abs(img[working.knee]!.x - hips.x) / length
    if (lift < 0.25 || reach < 0.25) {
      return { ready: false, hint: 'Stand side-on to the camera and lift one leg behind you, knee bent.' }
    }
    if (jointAngle(frame, working.hip, working.knee, working.ankle) > 150) {
      return { ready: false, hint: 'Bend your back knee into attitude (a straight leg is an arabesque).' }
    }
    const near = SIDES[nearSide(frame)]
    return { ready: true, ctx: { frame, img, working, standing, near, legLength: length } }
  },

  checks: [
    {
      id: 'standing-leg',
      label: 'Standing leg straight',
      evaluate: ({ frame, standing }) =>
        straightLeg(frame, standing, 'Straighten your standing leg: pull up through the knee.'),
    },
    {
      id: 'knee-bend',
      label: 'Back knee softly bent',
      evaluate({ frame, working }): CheckResult {
        const knee = jointAngle(frame, working.hip, working.knee, working.ankle)
        const { status, direction } = grade(knee, { good: [90, 130], tolerance: 15 })
        return {
          status,
          detail: fmtDeg(knee),
          message:
            direction === 'high'
              ? 'Bend your back knee more to curve the leg into attitude.'
              : 'Open the knee a little: aim for a soft, rounded curve.',
          joints: [working.hip, working.knee, working.ankle],
        }
      },
    },
    {
      id: 'knee-height',
      label: 'Knee lifted to hip height',
      evaluate({ img, working }): CheckResult {
        const hip = img[working.hip]!
        const knee = img[working.knee]!
        const elevation = Math.atan2(hip.y - knee.y, Math.abs(knee.x - hip.x)) * DEG
        return {
          status: grade(elevation, { good: [-12, 70], tolerance: 15 }).status,
          detail: elevation >= 0 ? `${fmtDeg(elevation)} above hip` : `${fmtDeg(-elevation)} below hip`,
          message: 'Lift your back knee up to hip height.',
          joints: [working.hip, working.knee],
        }
      },
    },
    {
      id: 'knee-over-foot',
      label: 'Knee higher than the foot',
      evaluate({ img, working, legLength }): CheckResult {
        // Positive = foot below the knee, as it should be.
        const drop = (img[working.ankle]!.y - img[working.knee]!.y) / legLength
        return {
          status: grade(drop, { good: [-0.05, 2], tolerance: 0.1 }).status,
          detail: drop >= 0 ? 'foot below knee' : 'foot above knee',
          message: "Keep your knee higher than your foot: don't let the knee drop.",
          joints: [working.knee, working.ankle],
        }
      },
    },
    {
      id: 'pointed-foot',
      label: 'Back foot pointed',
      evaluate: ({ frame, working }) => pointedFoot(frame, working, 'Point your back foot through the toes.'),
    },
    {
      id: 'chest',
      label: 'Chest lifted',
      evaluate({ img, near }): CheckResult {
        const lean = angleFromVertical(img[near.hip]!, img[near.shoulder]!)
        return {
          status: grade(lean, { good: [0, 25], tolerance: 15 }).status,
          detail: `${fmtDeg(lean)} forward`,
          message: 'Lift your chest: keep your back long and upright.',
          joints: [near.shoulder, near.hip],
        }
      },
    },
    {
      id: 'arm-up',
      label: 'One arm up',
      evaluate({ frame, img }): CheckResult {
        const arms = [SIDES.left, SIDES.right].filter((s) => isVisible(frame, [s.shoulder, s.wrist], 0.3))
        if (arms.length === 0) return { status: 'unknown', detail: 'arms not visible' }
        const top = arms.reduce((a, b) => (img[b.wrist]!.y < img[a.wrist]!.y ? b : a))
        // Positive = wrist above the shoulder, in torso lengths.
        const rise = (img[top.shoulder]!.y - img[top.wrist]!.y) / torsoLength(img)
        return {
          status: grade(rise, { good: [0.45, 5], tolerance: 0.2 }).status,
          detail: `${Math.round(rise * 100)}% of torso above shoulder`,
          message: 'Lift one arm up over your head (en haut).',
          joints: [top.shoulder, top.elbow, top.wrist],
        }
      },
    },
  ],
})
