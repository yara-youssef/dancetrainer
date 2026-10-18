import { describe, expect, it } from 'vitest'
import { LANDMARK_COUNT, L, type Point, type PoseFrame } from '@/pose/landmarks'
import { pirouette } from '../pirouette'
import { pushup } from '../pushup'
import type { MovementFeedback } from '../types'

type Coords = Record<number, [number, number]>
const DT = 33

function frame(coords: Coords, opts: { yaw?: number; dx?: number } = {}): PoseFrame {
  // Rotate the figure about a vertical axis through the hips (yaw in radians).
  const yaw = opts.yaw ?? 0
  const cx = 0.5
  // The face stays visible in profile and disappears once the dancer is turned past side-on.
  const facingCamera = Math.cos(yaw) > -0.2
  const image: Point[] = Array.from({ length: LANDMARK_COUNT }, (_, i) => {
    const c = coords[i]
    if (!c) return { x: 0.5, y: 0.5, z: 0, visibility: 0.1 }
    const x = cx + (c[0] - cx) * Math.cos(yaw) + (opts.dx ?? 0)
    const z = (c[0] - cx) * Math.sin(yaw)
    const face = i <= 10
    return { x, y: c[1], z, visibility: face && !facingCamera ? 0.1 : 0.99 }
  })
  return { image, world: image.map((p) => ({ ...p })) }
}

function run(frames: PoseFrame[]): MovementFeedback[] {
  const tracker = pirouette.createTracker()
  return frames.map((f, i) => tracker.update(f, i * DT))
}

const lerp = (a: Coords, b: Coords, t: number): Coords =>
  Object.fromEntries(
    Object.entries(a).map(([k, p]) => {
      const q = b[Number(k)] ?? p
      return [k, [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]]
    }),
  )

describe('pirouette', () => {
  const passe = pirouette.illustration.points
  const standing: Coords = {
    ...passe,
    [L.LEFT_KNEE]: [0.55, 0.71],
    [L.LEFT_ANKLE]: [0.55, 0.91],
    [L.LEFT_HEEL]: [0.555, 0.93],
    [L.LEFT_FOOT_INDEX]: [0.56, 0.98],
  }
  const hold = (c: Coords, n: number, opts?: { dx?: (i: number) => number }) =>
    Array.from({ length: n }, (_, i) => frame(c, { dx: opts?.dx?.(i) }))
  const spin = (c: Coords | ((i: number) => Coords), turns: number, n: number) =>
    Array.from({ length: n }, (_, i) =>
      frame(typeof c === 'function' ? c(i) : c, { yaw: ((i + 1) / n) * turns * 2 * Math.PI }),
    )

  const last = (fbs: MovementFeedback[]) => fbs.at(-1)!

  it('counts a clean double', () => {
    const fbs = run([...hold(standing, 15), ...hold(passe, 5), ...spin(passe, 2, 36), ...hold(passe, 5), ...hold(standing, 35)])
    const reps = last(fbs).reps
    expect(reps).toHaveLength(1)
    expect(reps[0]!.title).toBe('Double')
    expect(reps[0]!.faults).toEqual([])
    expect(fbs.some((f) => f.say === 'Double! Clean.')).toBe(true)
  })

  it('counts singles and triples', () => {
    const single = run([...hold(standing, 15), ...spin(passe, 1, 18), ...hold(standing, 35)])
    const triple = run([...hold(standing, 15), ...spin(passe, 3, 50), ...hold(standing, 35)])
    expect(last(single).reps.map((r) => r.title)).toEqual(['Single'])
    expect(last(triple).reps.map((r) => r.title)).toEqual(['Triple'])
  })

  it('notices the passé dropping during the turn', () => {
    const dropping = (i: number) => (i < 12 ? passe : lerp(passe, standing, 0.9))
    const r = last(run([...hold(standing, 15), ...spin(dropping, 2, 36), ...hold(standing, 35)])).reps[0]!
    expect(r.ok).toBe(false)
    expect(r.faults[0]).toMatch(/passé up/)
  })

  it('flags a wobbly landing', () => {
    const wobble = (i: number) => 0.05 * Math.sin(i / 2)
    const r = last(run([...hold(standing, 15), ...spin(passe, 1, 18), ...hold(standing, 35, { dx: wobble })])).reps[0]!
    expect(r.faults).toContain('Control the landing: finish in a steady position.')
  })

  it('ignores a quarter turn and back', () => {
    const quarter = Array.from({ length: 20 }, (_, i) =>
      frame(passe, { yaw: (Math.PI / 2) * Math.sin((i / 19) * Math.PI) }),
    )
    expect(last(run([...hold(standing, 15), ...quarter, ...hold(standing, 35)])).reps).toEqual([])
  })
})

describe('push-up', () => {
  const top = pushup.illustration.points
  const bottom: Coords = {
    ...top,
    [L.NOSE]: [0.2, 0.73],
    [L.LEFT_EAR]: [0.24, 0.71],
    [L.LEFT_SHOULDER]: [0.31, 0.73],
    [L.RIGHT_SHOULDER]: [0.33, 0.73],
    [L.LEFT_ELBOW]: [0.385, 0.765],
    [L.RIGHT_ELBOW]: [0.405, 0.765],
    [L.LEFT_HIP]: [0.56, 0.75],
    [L.RIGHT_HIP]: [0.58, 0.75],
    [L.LEFT_KNEE]: [0.72, 0.765],
    [L.RIGHT_KNEE]: [0.74, 0.765],
    [L.LEFT_ANKLE]: [0.88, 0.775],
    [L.RIGHT_ANKLE]: [0.9, 0.775],
  }
  /** One rep: down and up over `n` frames, reaching `depth` (0..1) of the way to the bottom. */
  const rep = (n: number, depth = 1, patchBottom: Coords = {}) =>
    Array.from({ length: n }, (_, i) => {
      const t = Math.sin((i / (n - 1)) * Math.PI) * depth
      return frame(lerp(top, { ...bottom, ...patchBottom }, t))
    })
  const runPushups = (frames: PoseFrame[]) => {
    const tracker = pushup.createTracker()
    return frames.map((f, i) => tracker.update(f, i * DT))
  }
  const still = (n: number) => Array.from({ length: n }, () => frame(top))

  it('counts clean reps', () => {
    const fbs = runPushups([...still(10), ...rep(45), ...still(5), ...rep(45), ...still(5), ...rep(45), ...still(5)])
    const reps = fbs.at(-1)!.reps
    expect(reps.map((r) => r.ok)).toEqual([true, true, true])
    expect(fbs.filter((f) => f.say).map((f) => f.say)).toEqual(['1', '2', '3'])
  })

  it('calls out a half rep', () => {
    const r = runPushups([...still(10), ...rep(45, 0.5), ...still(5)]).at(-1)!.reps[0]!
    expect(r.faults[0]).toMatch(/Go lower/)
  })

  it('calls out sagging hips', () => {
    const r = runPushups([...still(10), ...rep(45, 1, { [L.LEFT_HIP]: [0.56, 0.84], [L.RIGHT_HIP]: [0.58, 0.84] }), ...still(5)])
      .at(-1)!.reps[0]!
    expect(r.faults).toContain('Your hips sagged: keep your core tight.')
  })

  it('asks to slow down when dropping too fast', () => {
    const r = runPushups([...still(10), ...rep(15), ...still(5)]).at(-1)!.reps[0]!
    expect(r.faults).toContain('Slow down: control the way down.')
  })

  it('waits for a plank position', () => {
    const standing = frame({ ...top, [L.LEFT_SHOULDER]: [0.5, 0.2], [L.LEFT_ANKLE]: [0.5, 0.95], [L.LEFT_WRIST]: [0.5, 0.5] })
    expect(pushup.createTracker().update(standing, 0).hint).toMatch(/plank/)
  })
})
