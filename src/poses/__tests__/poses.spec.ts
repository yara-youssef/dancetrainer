import { describe, expect, it } from 'vitest'
import { L } from '@/pose/landmarks'
import { passe } from '../passe'
import { downwardDog } from '../downwardDog'
import { plank } from '../plank'
import { analyse, frameFrom, statuses, withFarSide } from './fixtures'

const allGood = (r: ReturnType<typeof statuses>) =>
  typeof r !== 'string' && Object.values(r).every((s) => s === 'good')

describe('passé (front view)', () => {
  // Person faces the camera; their left side is at larger x. Right leg stands, left leg works.
  const good = {
    [L.NOSE]: [0.5, 0.11],
    [L.LEFT_EAR]: [0.53, 0.1],
    [L.RIGHT_EAR]: [0.47, 0.1],
    [L.LEFT_SHOULDER]: [0.58, 0.2],
    [L.RIGHT_SHOULDER]: [0.42, 0.2],
    [L.LEFT_ELBOW]: [0.64, 0.33],
    [L.RIGHT_ELBOW]: [0.36, 0.33],
    [L.LEFT_WRIST]: [0.57, 0.44],
    [L.RIGHT_WRIST]: [0.43, 0.44],
    [L.LEFT_HIP]: [0.55, 0.5],
    [L.RIGHT_HIP]: [0.45, 0.5],
    [L.RIGHT_KNEE]: [0.45, 0.72],
    [L.RIGHT_ANKLE]: [0.45, 0.94],
    [L.RIGHT_HEEL]: [0.45, 0.96],
    [L.RIGHT_FOOT_INDEX]: [0.44, 0.98],
    [L.LEFT_KNEE]: [0.7, 0.62],
    [L.LEFT_ANKLE]: [0.52, 0.69],
    [L.LEFT_HEEL]: [0.53, 0.71],
    [L.LEFT_FOOT_INDEX]: [0.47, 0.72],
  } as Record<number, [number, number]>

  const variant = (patch: Record<number, [number, number]>) => analyse(passe, frameFrom({ ...good, ...patch }))

  it('accepts a correct passé', () => {
    expect(statuses(analyse(passe, frameFrom(good)))).toSatisfy(allGood)
  })

  it('asks for a higher knee when the toe is at mid-shin', () => {
    const r = variant({
      [L.LEFT_KNEE]: [0.66, 0.72],
      [L.LEFT_ANKLE]: [0.5, 0.82],
      [L.LEFT_HEEL]: [0.51, 0.84],
      [L.LEFT_FOOT_INDEX]: [0.47, 0.86],
    })
    if (typeof r === 'string') throw new Error(r)
    expect(r['passe-height']!.status).toBe('bad')
    expect(r['passe-height']!.message).toMatch(/knee higher/)
  })

  it('flags a flexed foot', () => {
    const r = variant({ [L.LEFT_FOOT_INDEX]: [0.5, 0.64] })
    expect(statuses(r)).toMatchObject({ 'pointed-foot': 'bad' })
  })

  it('flags a bent standing leg', () => {
    expect(statuses(variant({ [L.RIGHT_KNEE]: [0.5, 0.72] }))).toMatchObject({ 'standing-leg': 'bad' })
  })

  it('flags a parallel (not turned-out) knee', () => {
    expect(statuses(variant({ [L.LEFT_KNEE]: [0.58, 0.62] }))).toMatchObject({ turnout: 'bad' })
  })

  it('asks for rounder arms when they are straight', () => {
    const r = variant({
      [L.LEFT_ELBOW]: [0.66, 0.32],
      [L.LEFT_WRIST]: [0.74, 0.44],
      [L.RIGHT_ELBOW]: [0.34, 0.32],
      [L.RIGHT_WRIST]: [0.26, 0.44],
    })
    if (typeof r === 'string') throw new Error(r)
    expect(r['rounded-arms']!.status).toBe('bad')
    expect(r['rounded-arms']!.message).toMatch(/Round your arms/)
  })

  it('notices a hitched working hip', () => {
    const r = variant({ [L.LEFT_HIP]: [0.55, 0.47] })
    if (typeof r === 'string') throw new Error(r)
    expect(r['hips-level']!.status).not.toBe('good')
    expect(r['hips-level']!.message).toMatch(/hitch/)
  })

  it('works with the other leg too', () => {
    const mirrored = Object.fromEntries(
      Object.entries(good).map(([i, [x, y]]) => [mirrorIndex(Number(i)), [1 - x, y]]),
    ) as Record<number, [number, number]>
    expect(statuses(analyse(passe, frameFrom(mirrored)))).toSatisfy(allGood)
  })

  it('waits until a foot is lifted', () => {
    const r = variant({
      [L.LEFT_KNEE]: [0.55, 0.72],
      [L.LEFT_ANKLE]: [0.55, 0.94],
      [L.LEFT_HEEL]: [0.55, 0.96],
      [L.LEFT_FOOT_INDEX]: [0.56, 0.98],
    })
    expect(r).toMatch(/Draw one foot up/)
  })

  it('asks to see the whole body when feet are out of frame', () => {
    expect(analyse(passe, frameFrom(good, [L.RIGHT_ANKLE]))).toMatch(/whole body/)
  })
})

describe('downward dog (side view)', () => {
  const base = {
    [L.LEFT_EAR]: [0.3, 0.66],
    [L.LEFT_SHOULDER]: [0.34, 0.6],
    [L.LEFT_ELBOW]: [0.27, 0.75],
    [L.LEFT_WRIST]: [0.2, 0.9],
    [L.LEFT_INDEX]: [0.17, 0.9],
    [L.LEFT_HIP]: [0.55, 0.3],
    [L.LEFT_KNEE]: [0.67, 0.6],
    [L.LEFT_ANKLE]: [0.78, 0.88],
    [L.LEFT_HEEL]: [0.8, 0.89],
    [L.LEFT_FOOT_INDEX]: [0.74, 0.91],
  } as Record<number, [number, number]>
  const run = (patch: Record<number, [number, number]> = {}) => {
    const { coords, hidden } = withFarSide({ ...base, ...patch }, 'left')
    return analyse(downwardDog, frameFrom(coords, hidden))
  }

  it('accepts a good downward dog', () => {
    expect(statuses(run())).toSatisfy(allGood)
  })

  it('flags lifted heels', () => {
    expect(statuses(run({ [L.LEFT_HEEL]: [0.82, 0.8] }))).toMatchObject({ 'heels-down': 'bad' })
  })

  it('flags bent arms', () => {
    expect(statuses(run({ [L.LEFT_ELBOW]: [0.22, 0.7] }))).toMatchObject({ 'arms-straight': 'bad' })
  })

  it('flags a lifted head', () => {
    expect(statuses(run({ [L.LEFT_EAR]: [0.3, 0.5] }))).toMatchObject({ 'head-relaxed': 'bad' })
  })

  it('asks for higher hips when the shape is too flat', () => {
    const r = run({ [L.LEFT_HIP]: [0.55, 0.56], [L.LEFT_KNEE]: [0.67, 0.72] })
    if (typeof r === 'string') throw new Error(r)
    expect(r['hip-angle']!.status).toBe('bad')
    expect(r['hip-angle']!.message).toMatch(/hips higher/)
  })

  it('waits until the hips are up', () => {
    expect(run({ [L.LEFT_HIP]: [0.55, 0.7] })).toMatch(/lift your hips/)
  })
})

describe('plank (side view)', () => {
  const base = {
    [L.LEFT_EAR]: [0.24, 0.58],
    [L.LEFT_SHOULDER]: [0.3, 0.6],
    [L.LEFT_ELBOW]: [0.3, 0.7],
    [L.LEFT_WRIST]: [0.3, 0.8],
    [L.LEFT_HIP]: [0.55, 0.65],
    [L.LEFT_KNEE]: [0.72, 0.685],
    [L.LEFT_ANKLE]: [0.88, 0.72],
    [L.LEFT_HEEL]: [0.89, 0.7],
    [L.LEFT_FOOT_INDEX]: [0.87, 0.8],
  } as Record<number, [number, number]>
  const run = (patch: Record<number, [number, number]> = {}) => {
    const { coords, hidden } = withFarSide({ ...base, ...patch }, 'left')
    return analyse(plank, frameFrom(coords, hidden))
  }

  it('accepts a good plank', () => {
    expect(statuses(run())).toSatisfy(allGood)
  })

  it('detects sagging hips', () => {
    const r = run({ [L.LEFT_HIP]: [0.55, 0.73] })
    if (typeof r === 'string') throw new Error(r)
    expect(r['body-line']!.status).toBe('bad')
    expect(r['body-line']!.message).toMatch(/sagging/)
  })

  it('detects piked hips', () => {
    const r = run({ [L.LEFT_HIP]: [0.55, 0.56] })
    if (typeof r === 'string') throw new Error(r)
    expect(r['body-line']!.status).toBe('bad')
    expect(r['body-line']!.message).toMatch(/Lower your hips/)
  })

  it('notices hands placed ahead of the shoulders', () => {
    const r = run({ [L.LEFT_ELBOW]: [0.25, 0.7], [L.LEFT_WRIST]: [0.2, 0.8] })
    if (typeof r === 'string') throw new Error(r)
    expect(r.stacked!.status).not.toBe('good')
    expect(r.stacked!.message).toMatch(/back under your shoulders/)
  })

  it('detects a dropped head', () => {
    const r = run({ [L.LEFT_EAR]: [0.25, 0.7] })
    if (typeof r === 'string') throw new Error(r)
    expect(r.neck!.status).toBe('bad')
    expect(r.neck!.message).toMatch(/drop/)
  })

  it('supports a forearm plank', () => {
    const r = run({ [L.LEFT_ELBOW]: [0.3, 0.8], [L.LEFT_WRIST]: [0.2, 0.8] })
    expect(statuses(r)).toSatisfy(allGood)
  })

  it('waits while standing up', () => {
    const r = run({ [L.LEFT_HIP]: [0.3, 0.6], [L.LEFT_SHOULDER]: [0.3, 0.3], [L.LEFT_ANKLE]: [0.3, 0.9] })
    expect(r).toMatch(/Get into a plank/)
  })
})

function mirrorIndex(i: number): number {
  // Left/right landmark pairs are adjacent (odd = left, even = right) from index 1 upward.
  if (i === 0) return 0
  return i % 2 === 1 ? i + 1 : i - 1
}
