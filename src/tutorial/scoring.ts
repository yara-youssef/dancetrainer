import type { Point } from '@/pose/landmarks'
import { compare, type Comparison } from './compare'
import { poseAt, type PoseTrack } from './track'

/** Users naturally lag the teacher a little; match against this window of teacher time. */
const LAG_BEFORE = 0.6
const LAG_AFTER = 0.15

export interface FrameResult {
  t: number
  score: number
  comparison: Comparison | null
}

export interface AttemptResult {
  /** 0–100 over the whole attempt (frames where you weren't visible count as 0). */
  score: number
  /** The most common corrections, most frequent first. */
  corrections: string[]
  /** The weakest second, in teacher time, if the attempt wasn't great. */
  weakest: { start: number; end: number } | null
  frames: number
}

/** The best match for the user's pose around teacher time `t`. */
export function matchAt(track: PoseTrack, user: Point[], t: number, flips: { user: boolean; teacher: boolean }) {
  let best: Comparison | null = null
  for (let dt = -LAG_BEFORE; dt <= LAG_AFTER + 1e-9; dt += 1 / track.fps) {
    const teacher = poseAt(track, t + dt)
    if (!teacher) continue
    const c = compare({ points: user, flipped: flips.user }, { points: teacher, flipped: flips.teacher })
    if (c && (!best || c.score > best.score)) best = c
  }
  return best
}

/** Collects frame-by-frame matches during one attempt and summarises them. */
export class AttemptScorer {
  private frames: FrameResult[] = []

  constructor(
    private track: PoseTrack,
    private flips: { user: boolean; teacher: boolean },
  ) {}

  add(user: Point[] | null, teacherTime: number): FrameResult {
    const comparison = user ? matchAt(this.track, user, teacherTime, this.flips) : null
    const result = { t: teacherTime, score: comparison?.score ?? 0, comparison }
    this.frames.push(result)
    return result
  }

  result(): AttemptResult {
    const n = this.frames.length
    if (n === 0) return { score: 0, corrections: [], weakest: null, frames: 0 }
    const score = Math.round(this.frames.reduce((s, f) => s + f.score, 0) / n)

    const counts = new Map<string, number>()
    for (const f of this.frames) {
      const worst = f.comparison?.limbs[0]
      if (f.score < 75 && worst && worst.error > 35) counts.set(worst.hint, (counts.get(worst.hint) ?? 0) + 1)
    }
    const minCount = Math.max(3, n * 0.08)
    const corrections = [...counts]
      .filter(([, c]) => c >= minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([hint]) => hint)
    if (this.frames.every((f) => !f.comparison)) corrections.unshift('Make sure your whole body is in view of the camera')

    let weakest: AttemptResult['weakest'] = null
    if (score < 70 && n > 1) {
      const span = this.frames.at(-1)!.t - this.frames[0]!.t
      const window = Math.max(1, Math.round((n / Math.max(span, 0.1)) * 1)) // ~1 second of frames
      let worst = Infinity
      for (let i = 0; i + window <= n; i++) {
        const avg = this.frames.slice(i, i + window).reduce((s, f) => s + f.score, 0) / window
        if (avg < worst) {
          worst = avg
          weakest = { start: this.frames[i]!.t, end: this.frames[i + window - 1]!.t }
        }
      }
    }
    return { score, corrections, weakest, frames: n }
  }
}

export function stars(score: number): number {
  return score >= 85 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0
}
