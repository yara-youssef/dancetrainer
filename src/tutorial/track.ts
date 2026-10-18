import { L, type Point } from '@/pose/landmarks'
import { dist2d, midpoint } from '@/pose/geometry'

/** The teacher's pose through a video, sampled at a fixed rate. */
export interface PoseTrack {
  fps: number
  duration: number
  /** Image landmarks (aspect-corrected) per sample, or null where no dancer was found. */
  frames: (Point[] | null)[]
}

export interface Section {
  start: number
  end: number
}

/** The sample nearest to time `t` (seconds), or null. */
export function poseAt(track: PoseTrack, t: number): Point[] | null {
  const i = Math.round(t * track.fps)
  return track.frames[Math.min(track.frames.length - 1, Math.max(0, i))] ?? null
}

/** Compact a frame for storage: 3 decimals, no depth. */
export function compactPoints(points: Point[]): Point[] {
  const r = (v: number) => Math.round(v * 1000) / 1000
  return points.map((p) => ({ x: r(p.x), y: r(p.y), z: 0, visibility: r(p.visibility ?? 1) }))
}

/** Fill short gaps (missed detections) with the nearest neighbour. */
export function fillGaps(frames: (Point[] | null)[], maxGap = 3): (Point[] | null)[] {
  const out = [...frames]
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue
    let j = i
    while (j < out.length && !out[j]) j++
    const gap = j - i
    if (gap <= maxGap) {
      for (let k = i; k < j; k++) {
        const before = out[i - 1]
        const after = out[j]
        out[k] = (k - i < gap / 2 ? (before ?? after) : (after ?? before)) ?? null
      }
    }
    i = j
  }
  return out
}

const MOVING = [
  L.LEFT_ELBOW,
  L.RIGHT_ELBOW,
  L.LEFT_WRIST,
  L.RIGHT_WRIST,
  L.LEFT_KNEE,
  L.RIGHT_KNEE,
  L.LEFT_ANKLE,
  L.RIGHT_ANKLE,
]

/** How much the dancer moves at each sample (body-size normalised, lightly smoothed). */
export function motionEnergy(track: PoseTrack): number[] {
  const raw = track.frames.map((f, i) => {
    const prev = track.frames[i - 1]
    if (!f || !prev) return 0
    const size = dist2d(
      midpoint(f[L.LEFT_SHOULDER]!, f[L.RIGHT_SHOULDER]!),
      midpoint(f[L.LEFT_HIP]!, f[L.RIGHT_HIP]!),
    )
    if (size === 0) return 0
    return MOVING.reduce((sum, j) => sum + dist2d(f[j]!, prev[j]!), 0) / MOVING.length / size
  })
  const k = 2
  return raw.map((_, i) => {
    const win = raw.slice(Math.max(0, i - k), i + k + 1)
    return win.reduce((a, b) => a + b, 0) / win.length
  })
}

/**
 * Splits the dance into sections of `min`–`max` seconds, cutting at the stillest
 * moment in each window (dancers naturally pause or hit a pose between phrases).
 */
export function splitSections(track: PoseTrack, min = 3, max = 8): Section[] {
  const energy = motionEnergy(track)
  const first = track.frames.findIndex(Boolean)
  const lastIdx = track.frames.length - 1 - [...track.frames].reverse().findIndex(Boolean)
  if (first < 0) return []
  const startT = first / track.fps
  const endT = Math.min(track.duration, (lastIdx + 1) / track.fps)

  const sections: Section[] = []
  let start = startT
  // A little slack so a remainder of max + a few frames isn't split into a tiny extra piece.
  while (endT - start > max + 0.5) {
    // Stillest moment wins; among equally still moments, prefer an even section length.
    const target = start + (min + max) / 2
    let best = start + max
    let bestCost = Infinity
    for (let t = start + min; t <= start + max; t += 1 / track.fps) {
      const cost = (energy[Math.round(t * track.fps)] ?? Infinity) + 0.0005 * Math.abs(t - target)
      if (cost < bestCost) {
        bestCost = cost
        best = t
      }
    }
    sections.push({ start, end: best })
    start = best
  }
  // A short tail is merged into the previous section rather than left on its own.
  if (sections.length && endT - start < min) sections.at(-1)!.end = endT
  else sections.push({ start, end: endT })
  return sections.map((s) => ({ start: round(s.start), end: round(s.end) }))
}

const round = (t: number) => Math.round(t * 100) / 100

export function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
