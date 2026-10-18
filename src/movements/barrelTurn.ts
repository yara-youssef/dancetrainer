import { L, SIDES } from '@/pose/landmarks'
import { isVisible, jointAngle } from '@/poses/common'
import type { MovementDefinition } from './types'
import { TurnTracker, type TurnConfig } from './turns'

/** Minimum torso tilt (degrees from vertical) for a barrel turn. */
const TILT = 35

const config: TurnConfig = {
  readyHint: 'Face the camera, then hinge forward and turn with your torso tilted.',
  canStart: (f) => f.tilt >= TILT * 0.7,
  checks: [
    {
      label: 'torso tilted',
      fault: 'Keep your torso tilted: hinge from the hips through the whole turn.',
      pass: (f) => f.tilt >= TILT,
    },
    {
      label: 'arms extended',
      fault: 'Keep your arms long and extended.',
      pass: (f) =>
        [SIDES.left, SIDES.right]
          .filter((s) => isVisible(f.frame, [s.shoulder, s.elbow, s.wrist], 0.3))
          .every((s) => jointAngle(f.frame, s.shoulder, s.elbow, s.wrist) >= 140),
    },
    {
      label: 'standing leg strong',
      fault: "Keep your standing leg strong: don't sink into it.",
      pass: (f) => jointAngle(f.frame, f.standing.hip, f.standing.knee, f.standing.ankle) >= 140,
    },
  ],
}

export const barrelTurn: MovementDefinition = {
  kind: 'movement',
  id: 'barrel-turn',
  name: 'Barrel turn',
  category: 'Ballet',
  unit: 'turn',
  summary: 'The jazz turn with a tilted torso: counts rotations and checks the tilt, long arms, standing leg and landing.',
  cameraTip:
    'Face the camera, 3 m away, whole body in view. Phones: use the back camera, and good light helps with fast turns.',
  cues: [
    'Start facing the camera',
    'Hinge forward from the hips: torso tilted, back long',
    'Keep the tilt for the whole turn',
    'Arms long and extended',
    'Strong standing leg, controlled finish facing the camera',
  ],
  illustration: {
    view: 'side',
    spin: true,
    points: {
      [L.NOSE]: [0.18, 0.39],
      [L.LEFT_EAR]: [0.22, 0.37],
      [L.LEFT_SHOULDER]: [0.29, 0.4],
      [L.RIGHT_SHOULDER]: [0.31, 0.4],
      [L.LEFT_ELBOW]: [0.17, 0.33],
      [L.LEFT_WRIST]: [0.06, 0.27],
      [L.LEFT_INDEX]: [0.03, 0.25],
      [L.RIGHT_ELBOW]: [0.2, 0.35],
      [L.RIGHT_WRIST]: [0.09, 0.3],
      [L.RIGHT_INDEX]: [0.06, 0.28],
      [L.LEFT_HIP]: [0.55, 0.55],
      [L.RIGHT_HIP]: [0.57, 0.55],
      [L.LEFT_KNEE]: [0.41, 0.6],
      [L.LEFT_ANKLE]: [0.5, 0.74],
      [L.LEFT_HEEL]: [0.48, 0.72],
      [L.LEFT_FOOT_INDEX]: [0.54, 0.76],
      [L.RIGHT_KNEE]: [0.57, 0.75],
      [L.RIGHT_ANKLE]: [0.57, 0.92],
      [L.RIGHT_HEEL]: [0.59, 0.91],
      [L.RIGHT_FOOT_INDEX]: [0.55, 0.97],
    },
  },
  createTracker: () => new TurnTracker(config),
}
