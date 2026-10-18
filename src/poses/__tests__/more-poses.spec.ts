import { describe, expect, it } from 'vitest'
import { L } from '@/pose/landmarks'
import type { PoseDefinition } from '../types'
import { arabesque } from '../arabesque'
import { attitude } from '../attitude'
import { releve } from '../releve'
import { plie } from '../plie'
import { tendu } from '../tendu'
import { tree } from '../tree'
import { warrior2 } from '../warrior2'
import { sidePlank } from '../sidePlank'
import { analyse, frameFrom, statuses, withFarSide } from './fixtures'

type Coords = Record<number, [number, number]>

const allGood = (r: ReturnType<typeof statuses>) =>
  typeof r !== 'string' && Object.values(r).every((s) => s === 'good')

/** Runs a pose on base coordinates with a patch applied; throws if it isn't ready. */
function checker(pose: PoseDefinition, base: Coords, side?: 'left' | 'right') {
  const raw = (patch: Coords = {}) => {
    const coords = { ...base, ...patch }
    if (!side) return analyse(pose, frameFrom(coords))
    const far = withFarSide(coords, side)
    return analyse(pose, frameFrom(far.coords, far.hidden))
  }
  const ready = (patch: Coords = {}) => {
    const r = raw(patch)
    if (typeof r === 'string') throw new Error(`not ready: ${r}`)
    return r
  }
  return { raw, ready }
}

describe('arabesque (side view)', () => {
  // Facing toward small x; right leg stands, left leg extends back toward large x.
  const { raw, ready } = checker(arabesque, {
    [L.NOSE]: [0.39, 0.16],
    [L.LEFT_EAR]: [0.41, 0.15],
    [L.RIGHT_EAR]: [0.42, 0.15],
    [L.LEFT_SHOULDER]: [0.43, 0.22],
    [L.RIGHT_SHOULDER]: [0.44, 0.22],
    [L.LEFT_ELBOW]: [0.32, 0.22],
    [L.LEFT_WRIST]: [0.21, 0.21],
    [L.RIGHT_ELBOW]: [0.5, 0.25],
    [L.RIGHT_WRIST]: [0.58, 0.28],
    [L.RIGHT_HIP]: [0.5, 0.5],
    [L.RIGHT_KNEE]: [0.5, 0.72],
    [L.RIGHT_ANKLE]: [0.5, 0.94],
    [L.RIGHT_HEEL]: [0.51, 0.96],
    [L.RIGHT_FOOT_INDEX]: [0.46, 0.97],
    [L.LEFT_HIP]: [0.51, 0.5],
    [L.LEFT_KNEE]: [0.73, 0.48],
    [L.LEFT_ANKLE]: [0.95, 0.46],
    [L.LEFT_HEEL]: [0.95, 0.44],
    [L.LEFT_FOOT_INDEX]: [1.0, 0.455],
  })

  it('accepts a good arabesque', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('asks for a higher back leg', () => {
    const r = ready({ [L.LEFT_KNEE]: [0.68, 0.62], [L.LEFT_ANKLE]: [0.85, 0.75], [L.LEFT_FOOT_INDEX]: [0.89, 0.78] })
    expect(r['leg-height']!.status).toBe('bad')
    expect(r['leg-height']!.message).toMatch(/higher/)
  })

  it('flags a bent back knee', () => {
    expect(statuses(ready({ [L.LEFT_KNEE]: [0.73, 0.4] }))).toMatchObject({ 'working-leg': 'bad' })
  })

  it('flags a collapsed chest', () => {
    const r = ready({ [L.LEFT_SHOULDER]: [0.3, 0.35], [L.RIGHT_SHOULDER]: [0.31, 0.35] })
    expect(r.chest!.status).toBe('bad')
  })

  it('flags a dropped front arm', () => {
    const r = ready({ [L.LEFT_ELBOW]: [0.38, 0.33], [L.LEFT_WRIST]: [0.3, 0.45] })
    expect(r['front-arm']!.status).toBe('bad')
    expect(r['front-arm']!.message).toMatch(/shoulder height/)
  })

  it('waits for a leg to extend behind', () => {
    expect(raw({ [L.LEFT_KNEE]: [0.51, 0.72], [L.LEFT_ANKLE]: [0.51, 0.94] })).toMatch(/extend one leg/)
  })
})

describe('relevé (side view)', () => {
  // Facing toward small x (toes point left).
  const { raw, ready } = checker(
    releve,
    {
      [L.LEFT_EAR]: [0.5, 0.12],
      [L.LEFT_SHOULDER]: [0.5, 0.2],
      [L.LEFT_ELBOW]: [0.5, 0.35],
      [L.LEFT_WRIST]: [0.5, 0.48],
      [L.LEFT_HIP]: [0.5, 0.5],
      [L.LEFT_KNEE]: [0.5, 0.7],
      [L.LEFT_ANKLE]: [0.5, 0.86],
      [L.LEFT_HEEL]: [0.53, 0.88],
      [L.LEFT_FOOT_INDEX]: [0.47, 0.94],
    },
    'left',
  )

  it('accepts a good relevé', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('asks to rise higher', () => {
    expect(statuses(ready({ [L.LEFT_HEEL]: [0.54, 0.915] }))).toMatchObject({ height: 'bad' })
  })

  it('detects tipping forward', () => {
    const r = ready({ [L.LEFT_SHOULDER]: [0.36, 0.2], [L.LEFT_EAR]: [0.36, 0.12] })
    expect(r.vertical!.status).toBe('bad')
    expect(r.vertical!.message).toMatch(/tipping forward/)
  })

  it('detects the seat sticking out', () => {
    const r = ready({ [L.LEFT_HIP]: [0.56, 0.5] })
    expect(r.pelvis!.status).toBe('bad')
    expect(r.pelvis!.message).toMatch(/tailbone/)
  })

  it('flags bent knees', () => {
    expect(statuses(ready({ [L.LEFT_KNEE]: [0.45, 0.7] }))).toMatchObject({ knees: 'bad' })
  })

  it('waits until the heels lift', () => {
    expect(raw({ [L.LEFT_HEEL]: [0.55, 0.94] })).toMatch(/Rise up/)
  })
})

describe('plié in second (front view)', () => {
  const { raw, ready } = checker(plie, {
    [L.NOSE]: [0.5, 0.18],
    [L.LEFT_SHOULDER]: [0.58, 0.27],
    [L.RIGHT_SHOULDER]: [0.42, 0.27],
    [L.LEFT_ELBOW]: [0.68, 0.32],
    [L.RIGHT_ELBOW]: [0.32, 0.32],
    [L.LEFT_WRIST]: [0.76, 0.39],
    [L.RIGHT_WRIST]: [0.24, 0.39],
    [L.LEFT_HIP]: [0.55, 0.55],
    [L.RIGHT_HIP]: [0.45, 0.55],
    [L.LEFT_KNEE]: [0.68, 0.7],
    [L.RIGHT_KNEE]: [0.32, 0.7],
    [L.LEFT_ANKLE]: [0.68, 0.88],
    [L.RIGHT_ANKLE]: [0.32, 0.88],
    [L.LEFT_HEEL]: [0.66, 0.89],
    [L.RIGHT_HEEL]: [0.34, 0.89],
    [L.LEFT_FOOT_INDEX]: [0.72, 0.9],
    [L.RIGHT_FOOT_INDEX]: [0.28, 0.9],
  })

  it('accepts a good plié', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('catches knees rolling in', () => {
    const r = ready({ [L.LEFT_KNEE]: [0.56, 0.7], [L.RIGHT_KNEE]: [0.44, 0.7] })
    expect(r['knees-over-toes']!.status).toBe('bad')
  })

  it('asks for a deeper bend', () => {
    const r = ready({ [L.LEFT_KNEE]: [0.63, 0.7], [L.RIGHT_KNEE]: [0.37, 0.7] })
    expect(r.depth!.status).toBe('bad')
    expect(r.depth!.message).toMatch(/deeper/)
  })

  it('notices arms above the shoulders', () => {
    const r = ready({ [L.LEFT_WRIST]: [0.76, 0.18], [L.RIGHT_WRIST]: [0.24, 0.18] })
    expect(r['arm-height']!.status).toBe('bad')
    expect(r['arm-height']!.message).toMatch(/Lower your arms/)
  })

  it('waits for the knees to bend', () => {
    expect(raw({ [L.LEFT_KNEE]: [0.615, 0.715], [L.RIGHT_KNEE]: [0.385, 0.715] })).toMatch(/Bend your knees/)
  })
})

describe('tendu à la seconde (front view)', () => {
  const { raw, ready } = checker(tendu, {
    [L.NOSE]: [0.5, 0.11],
    [L.LEFT_SHOULDER]: [0.58, 0.2],
    [L.RIGHT_SHOULDER]: [0.42, 0.2],
    [L.LEFT_ELBOW]: [0.68, 0.25],
    [L.RIGHT_ELBOW]: [0.32, 0.25],
    [L.LEFT_WRIST]: [0.76, 0.32],
    [L.RIGHT_WRIST]: [0.24, 0.32],
    [L.LEFT_HIP]: [0.55, 0.5],
    [L.RIGHT_HIP]: [0.45, 0.5],
    [L.RIGHT_KNEE]: [0.45, 0.72],
    [L.RIGHT_ANKLE]: [0.45, 0.94],
    [L.RIGHT_HEEL]: [0.45, 0.96],
    [L.RIGHT_FOOT_INDEX]: [0.42, 0.97],
    [L.LEFT_KNEE]: [0.63, 0.71],
    [L.LEFT_ANKLE]: [0.71, 0.92],
    [L.LEFT_HEEL]: [0.7, 0.93],
    [L.LEFT_FOOT_INDEX]: [0.73, 0.97],
  })

  it('accepts a good tendu', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('flags a bent working knee', () => {
    expect(statuses(ready({ [L.LEFT_KNEE]: [0.7, 0.72] }))).toMatchObject({ 'working-leg': 'bad' })
  })

  it('flags a flexed foot', () => {
    expect(statuses(ready({ [L.LEFT_FOOT_INDEX]: [0.79, 0.9] }))).toMatchObject({ 'pointed-foot': 'bad' })
  })

  it('notices weight left between the feet', () => {
    const r = ready({ [L.LEFT_HIP]: [0.59, 0.5], [L.RIGHT_HIP]: [0.49, 0.5] })
    expect(r.weight!.status).not.toBe('good')
  })

  it('waits for the foot to slide out', () => {
    expect(raw({ [L.LEFT_KNEE]: [0.56, 0.72], [L.LEFT_ANKLE]: [0.57, 0.94] })).toMatch(/slide one foot/i)
  })
})

describe('tree pose (front view)', () => {
  const { ready } = checker(tree, {
    [L.NOSE]: [0.5, 0.11],
    [L.LEFT_SHOULDER]: [0.58, 0.2],
    [L.RIGHT_SHOULDER]: [0.42, 0.2],
    [L.LEFT_ELBOW]: [0.62, 0.36],
    [L.RIGHT_ELBOW]: [0.38, 0.36],
    [L.LEFT_WRIST]: [0.505, 0.33],
    [L.RIGHT_WRIST]: [0.495, 0.33],
    [L.LEFT_HIP]: [0.55, 0.5],
    [L.RIGHT_HIP]: [0.45, 0.5],
    [L.RIGHT_KNEE]: [0.45, 0.72],
    [L.RIGHT_ANKLE]: [0.45, 0.94],
    [L.RIGHT_HEEL]: [0.45, 0.96],
    [L.RIGHT_FOOT_INDEX]: [0.44, 0.98],
    [L.LEFT_KNEE]: [0.72, 0.6],
    [L.LEFT_ANKLE]: [0.5, 0.55],
    [L.LEFT_HEEL]: [0.51, 0.53],
    [L.LEFT_FOOT_INDEX]: [0.47, 0.56],
  })

  it('accepts a good tree pose', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('warns when the foot presses on the knee', () => {
    const r = ready({ [L.LEFT_KNEE]: [0.7, 0.62], [L.LEFT_ANKLE]: [0.5, 0.7], [L.LEFT_FOOT_INDEX]: [0.47, 0.72] })
    expect(r['foot-placement']!.status).toBe('bad')
    expect(r['foot-placement']!.message).toMatch(/never press on the joint/)
  })

  it('asks for palms together', () => {
    const r = ready({ [L.LEFT_WRIST]: [0.7, 0.45], [L.RIGHT_WRIST]: [0.3, 0.45] })
    expect(r.palms!.status).toBe('bad')
  })
})

describe('warrior II (front view)', () => {
  const { ready } = checker(warrior2, {
    [L.NOSE]: [0.5, 0.2],
    [L.LEFT_SHOULDER]: [0.55, 0.3],
    [L.RIGHT_SHOULDER]: [0.45, 0.3],
    [L.LEFT_ELBOW]: [0.68, 0.3],
    [L.RIGHT_ELBOW]: [0.32, 0.3],
    [L.LEFT_WRIST]: [0.8, 0.3],
    [L.RIGHT_WRIST]: [0.2, 0.3],
    [L.LEFT_HIP]: [0.54, 0.55],
    [L.RIGHT_HIP]: [0.46, 0.55],
    [L.LEFT_KNEE]: [0.74, 0.6],
    [L.LEFT_ANKLE]: [0.75, 0.85],
    [L.LEFT_HEEL]: [0.73, 0.86],
    [L.LEFT_FOOT_INDEX]: [0.8, 0.86],
    [L.RIGHT_KNEE]: [0.33, 0.7],
    [L.RIGHT_ANKLE]: [0.2, 0.85],
    [L.RIGHT_HEEL]: [0.19, 0.86],
    [L.RIGHT_FOOT_INDEX]: [0.21, 0.88],
  })

  it('accepts a good warrior II', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('asks for a deeper front knee', () => {
    const r = ready({ [L.LEFT_KNEE]: [0.7, 0.66] })
    expect(r['front-knee']!.status).toBe('bad')
    expect(r['front-knee']!.message).toMatch(/deeper/)
  })

  it('catches the front knee past the ankle', () => {
    const r = ready({ [L.LEFT_ANKLE]: [0.62, 0.85] })
    expect(r['knee-over-ankle']!.status).toBe('bad')
    expect(r['knee-over-ankle']!.message).toMatch(/past your ankle/)
  })

  it('asks to lift drooping arms', () => {
    const r = ready({ [L.LEFT_WRIST]: [0.8, 0.42], [L.RIGHT_WRIST]: [0.2, 0.42], [L.LEFT_ELBOW]: [0.68, 0.36], [L.RIGHT_ELBOW]: [0.32, 0.36] })
    expect(r['arm-height']!.status).toBe('bad')
    expect(r['arm-height']!.message).toMatch(/Lift your arms/)
  })

  it('flags leaning over the front leg', () => {
    const r = ready({ [L.LEFT_SHOULDER]: [0.63, 0.3], [L.RIGHT_SHOULDER]: [0.53, 0.3] })
    expect(r['torso-upright']!.status).toBe('bad')
  })
})

describe('side plank (front view)', () => {
  // Head toward small x, left side on the floor.
  const { raw, ready } = checker(sidePlank, {
    [L.NOSE]: [0.2, 0.48],
    [L.LEFT_SHOULDER]: [0.3, 0.55],
    [L.RIGHT_SHOULDER]: [0.3, 0.5],
    [L.LEFT_ELBOW]: [0.3, 0.68],
    [L.LEFT_WRIST]: [0.3, 0.82],
    [L.RIGHT_ELBOW]: [0.3, 0.38],
    [L.RIGHT_WRIST]: [0.3, 0.25],
    [L.LEFT_HIP]: [0.55, 0.66],
    [L.RIGHT_HIP]: [0.55, 0.62],
    [L.LEFT_KNEE]: [0.7, 0.72],
    [L.RIGHT_KNEE]: [0.7, 0.685],
    [L.LEFT_ANKLE]: [0.85, 0.78],
    [L.RIGHT_ANKLE]: [0.85, 0.75],
  })

  it('accepts a good side plank', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('detects dropped hips', () => {
    const r = ready({ [L.LEFT_HIP]: [0.55, 0.74], [L.RIGHT_HIP]: [0.55, 0.7] })
    expect(r['hips-lifted']!.status).toBe('bad')
    expect(r['hips-lifted']!.message).toMatch(/Lift your hips/)
  })

  it('notices the hand too far from the shoulder', () => {
    const r = ready({ [L.LEFT_ELBOW]: [0.225, 0.675], [L.LEFT_WRIST]: [0.15, 0.8] })
    expect(r.stacked!.status).toBe('bad')
  })

  it('supports a forearm side plank', () => {
    expect(statuses(ready({ [L.LEFT_WRIST]: [0.18, 0.7] }))).toSatisfy(allGood)
  })

  it('waits while standing', () => {
    const standing = raw({
      [L.LEFT_SHOULDER]: [0.48, 0.2],
      [L.RIGHT_SHOULDER]: [0.52, 0.2],
      [L.LEFT_HIP]: [0.48, 0.5],
      [L.RIGHT_HIP]: [0.52, 0.5],
      [L.LEFT_ANKLE]: [0.48, 0.94],
      [L.RIGHT_ANKLE]: [0.52, 0.94],
    })
    expect(standing).toMatch(/Get into a side plank/)
  })
})

describe('attitude derrière (side view)', () => {
  const { raw, ready } = checker(attitude, attitude.illustration.points)

  it('accepts a good attitude', () => {
    expect(statuses(ready())).toSatisfy(allGood)
  })

  it('catches the knee dropping below the foot', () => {
    const r = ready({ [L.LEFT_KNEE]: [0.68, 0.55], [L.LEFT_ANKLE]: [0.84, 0.45], [L.LEFT_HEEL]: [0.83, 0.43], [L.LEFT_FOOT_INDEX]: [0.88, 0.42] })
    expect(r['knee-over-foot']!.status).toBe('bad')
  })

  it('asks for an arm overhead', () => {
    const r = ready({ [L.LEFT_ELBOW]: [0.34, 0.3], [L.LEFT_WRIST]: [0.3, 0.4] })
    expect(r['arm-up']!.status).toBe('bad')
  })

  it('tells a straight back leg apart from attitude', () => {
    expect(raw({ [L.LEFT_KNEE]: [0.73, 0.48], [L.LEFT_ANKLE]: [0.95, 0.46] })).toMatch(/arabesque/)
  })
})
