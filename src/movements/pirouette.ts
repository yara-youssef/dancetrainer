import { L } from '@/pose/landmarks'
import { jointAngle } from '@/poses/common'
import type { MovementDefinition } from './types'
import { TurnTracker, type TurnConfig } from './turns'

/** How far the working ankle must be above the standing ankle (in leg lengths) to count as passé. */
const PASSE_LIFT = 0.3

const config: TurnConfig = {
  readyHint: 'Face the camera, prepare, then turn in passé.',
  canStart: (f) => f.lift >= PASSE_LIFT * 0.7,
  checks: [
    { label: 'passé held', fault: 'Keep your passé up through the whole turn.', pass: (f) => f.lift >= PASSE_LIFT },
    {
      label: 'standing leg straight',
      fault: 'Keep your standing leg straight while you turn.',
      pass: (f) => jointAngle(f.frame, f.standing.hip, f.standing.knee, f.standing.ankle) >= 155,
    },
    { label: 'upright', fault: 'Stay upright: stack your shoulders over your hips.', pass: (f) => f.tilt <= 12 },
  ],
}

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
  createTracker: () => new TurnTracker(config),
}
