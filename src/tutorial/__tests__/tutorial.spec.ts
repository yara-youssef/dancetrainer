import { describe, expect, it } from 'vitest'
import { LANDMARK_COUNT, L, type Point } from '@/pose/landmarks'
import { compare, ghostPose } from '../compare'
import { fillGaps, splitSections, type PoseTrack } from '../track'
import { AttemptScorer } from '../scoring'
import { parseLink } from '../links'

type Coords = Record<number, [number, number]>

// A person facing the camera in raw (unmirrored) camera coordinates: their left is at larger x.
const STAND: Coords = {
  [L.NOSE]: [0.5, 0.11],
  [L.LEFT_SHOULDER]: [0.58, 0.2],
  [L.RIGHT_SHOULDER]: [0.42, 0.2],
  [L.LEFT_ELBOW]: [0.6, 0.35],
  [L.RIGHT_ELBOW]: [0.4, 0.35],
  [L.LEFT_WRIST]: [0.61, 0.48],
  [L.RIGHT_WRIST]: [0.39, 0.48],
  [L.LEFT_HIP]: [0.55, 0.5],
  [L.RIGHT_HIP]: [0.45, 0.5],
  [L.LEFT_KNEE]: [0.55, 0.72],
  [L.RIGHT_KNEE]: [0.45, 0.72],
  [L.LEFT_ANKLE]: [0.55, 0.94],
  [L.RIGHT_ANKLE]: [0.45, 0.94],
}
// Left arm raised straight up.
const LEFT_ARM_UP: Coords = { ...STAND, [L.LEFT_ELBOW]: [0.6, 0.06], [L.LEFT_WRIST]: [0.61, -0.07] }

function pts(c: Coords, opts: { scale?: number; dx?: number } = {}): Point[] {
  const s = opts.scale ?? 1
  return Array.from({ length: LANDMARK_COUNT }, (_, i) => {
    const p = c[i]
    return p
      ? { x: 0.5 + (p[0] - 0.5) * s + (opts.dx ?? 0), y: 0.5 + (p[1] - 0.5) * s, z: 0, visibility: 0.99 }
      : { x: 0, y: 0, z: 0, visibility: 0 }
  })
}
/** The same person seen in a horizontally flipped video. */
const mirrorImage = (p: Point[]) => p.map((q) => ({ ...q, x: 1 - q.x }))

describe('compare', () => {
  it('scores the same pose 100 regardless of size and position', () => {
    const c = compare({ points: pts(STAND), flipped: true }, { points: pts(STAND, { scale: 0.6, dx: 0.2 }), flipped: true })
    expect(c?.score).toBe(100)
  })

  it('tells you which arm to lift, from your own point of view', () => {
    // Teacher faces you and raises the arm on the left of the screen (unflipped video: their right arm).
    const teacher = pts({ ...STAND, [L.RIGHT_ELBOW]: [0.4, 0.06], [L.RIGHT_WRIST]: [0.39, -0.07] })
    // In your mirrored selfie view, the arm on the left of the screen is your left arm.
    const c = compare({ points: pts(STAND), flipped: true }, { points: teacher, flipped: false })!
    expect(c.score).toBeLessThan(90)
    expect(c.limbs[0]!.hint).toBe('Lift your left arm higher')
  })

  it('matches when you copy the teacher like a mirror', () => {
    const teacher = pts({ ...STAND, [L.RIGHT_ELBOW]: [0.4, 0.06], [L.RIGHT_WRIST]: [0.39, -0.07] })
    // You raise your left arm; in the mirrored selfie it appears on the left, same as the teacher's.
    expect(compare({ points: pts(LEFT_ARM_UP), flipped: true }, { points: teacher, flipped: false })?.score).toBe(100)
  })

  it('handles a teacher video that is itself mirrored', () => {
    const teacher = mirrorImage(pts(LEFT_ARM_UP))
    expect(compare({ points: pts(LEFT_ARM_UP), flipped: true }, { points: teacher, flipped: true })?.score).toBeLessThan(90)
    expect(compare({ points: pts(LEFT_ARM_UP), flipped: false }, { points: teacher, flipped: true })?.score).toBe(100)
  })

  it('returns null when too little of the user is visible', () => {
    const hidden = pts(STAND).map((p) => ({ ...p, visibility: 0.1 }))
    expect(compare({ points: hidden, flipped: true }, { points: pts(STAND), flipped: true })).toBeNull()
  })

  it('places the ghost on the user’s body', () => {
    const ghost = ghostPose({ points: pts(STAND), flipped: true }, { points: pts(LEFT_ARM_UP, { scale: 0.5, dx: 0.3 }), flipped: true })!
    expect(ghost[L.LEFT_HIP]!.x).toBeCloseTo(0.55)
    expect(ghost[L.LEFT_WRIST]!.y).toBeCloseTo(-0.07)
  })
})

describe('track', () => {
  it('fills short gaps but leaves long ones', () => {
    const a = pts(STAND)
    const filled = fillGaps([a, null, null, a, null, null, null, null, a], 3)
    expect(filled.slice(0, 4).every(Boolean)).toBe(true)
    expect(filled.slice(4, 8).every((f) => f === null)).toBe(true)
  })

  it('splits at the stillest moments', () => {
    // 20 s at 10 fps: arm swinging, with still pauses at 6 s and 12 s.
    const frames = Array.from({ length: 200 }, (_, i) => {
      const t = i / 10
      const still = Math.abs(t - 6) < 0.4 || Math.abs(t - 12) < 0.4
      const lift = still ? 0 : Math.sin(t * 3) * 0.1
      return pts({ ...STAND, [L.LEFT_WRIST]: [0.61 + lift, 0.48 - lift] })
    })
    const sections = splitSections({ fps: 10, duration: 20, frames }, 3, 8)
    expect(sections.length).toBe(3)
    expect(sections[0]!.end).toBeCloseTo(6, 0)
    expect(sections[1]!.end).toBeCloseTo(12, 0)
    expect(sections[2]!.end).toBe(20)
  })
})

describe('AttemptScorer', () => {
  const track: PoseTrack = {
    fps: 10,
    duration: 4,
    frames: Array.from({ length: 40 }, (_, i) => pts(i < 10 ? STAND : LEFT_ARM_UP)),
  }

  it('forgives a short delay behind the teacher', () => {
    const scorer = new AttemptScorer(track, { user: false, teacher: false })
    // The user does the same thing 0.4 s late.
    for (let i = 0; i < 40; i++) scorer.add(pts(i < 14 ? STAND : LEFT_ARM_UP), i / 10)
    expect(scorer.result().score).toBe(100)
  })

  it('reports the most common correction and the weakest moment', () => {
    const scorer = new AttemptScorer(track, { user: false, teacher: false })
    for (let i = 0; i < 40; i++) scorer.add(pts(STAND), i / 10)
    const r = scorer.result()
    expect(r.score).toBeLessThan(70)
    expect(r.corrections[0]).toBe('Lift your left arm higher')
    expect(r.weakest!.start).toBeGreaterThanOrEqual(1)
  })
})

describe('parseLink', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/abc123_-XY', 'abc123_-XY'],
    ['https://m.youtube.com/watch?v=xyz', 'xyz'],
  ])('reads YouTube id from %s', (link, id) => {
    expect(parseLink(link)).toEqual({ platform: 'youtube', videoId: id })
  })

  it('recognises TikTok, Instagram and junk', () => {
    expect(parseLink('https://www.tiktok.com/@a/video/123').platform).toBe('tiktok')
    expect(parseLink('https://vm.tiktok.com/ZM123/').platform).toBe('tiktok')
    expect(parseLink('https://www.instagram.com/reel/abc/').platform).toBe('instagram')
    expect(parseLink('not a link').platform).toBe('invalid')
  })
})
