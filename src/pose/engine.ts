import type { Point, PoseFrame } from './landmarks'
import type { CheckStatus, PoseDefinition } from '@/poses/types'

export interface CheckView {
  id: string
  label: string
  status: CheckStatus
  message?: string
  detail?: string
  joints: number[]
}

export interface Feedback {
  phase: 'no-person' | 'not-ready' | 'checking'
  hint?: string
  checks: CheckView[]
  /** 0–100: good checks count fully, minor issues count half. */
  score: number
  /** The most important correction right now. */
  topIssue?: CheckView
  /** Seconds the position has been held with no major issues. */
  holdSeconds: number
  bestHold: number
}

export interface EngineOptions {
  /** How long (ms) a status must persist before it is shown; 0 for single photos. */
  debounceMs?: number
  /** Landmark smoothing factor (1 = no smoothing). */
  smoothing?: number
}

interface Tracked {
  shown: CheckView
  pending?: { status: CheckStatus; since: number }
}

/** Turns a stream of pose frames into stable, human-friendly feedback for one pose. */
export class FeedbackEngine {
  private tracked = new Map<string, Tracked>()
  private smoother: Smoother
  private holdStart: number | null = null
  private bestHold = 0
  private readonly debounceMs: number

  constructor(
    private pose: PoseDefinition,
    opts: EngineOptions = {},
  ) {
    this.debounceMs = opts.debounceMs ?? 350
    this.smoother = new Smoother(opts.smoothing ?? 0.5)
  }

  update(raw: PoseFrame | null, now: number): Feedback {
    const empty = (phase: Feedback['phase'], hint?: string): Feedback => {
      this.holdStart = null
      this.tracked.clear()
      return { phase, hint, checks: this.idleChecks(), score: 0, holdSeconds: 0, bestHold: this.bestHold }
    }
    if (!raw) {
      this.smoother.reset()
      return empty('no-person', 'Step into view of the camera.')
    }
    const frame = this.smoother.push(raw)
    const prep = this.pose.prepare(frame)
    if (!prep.ready) return empty('not-ready', prep.hint)

    const checks = this.pose.checks.map((check) => {
      const r = check.evaluate(prep.ctx)
      const view: CheckView = { id: check.id, label: check.label, ...r, joints: r.joints ?? [] }
      return this.debounce(view, now)
    })

    const known = checks.filter((c) => c.status !== 'unknown')
    const points = known.reduce((sum, c) => sum + (c.status === 'good' ? 1 : c.status === 'warn' ? 0.5 : 0), 0)
    const score = known.length ? Math.round((points / known.length) * 100) : 0
    const topIssue = checks.find((c) => c.status === 'bad') ?? checks.find((c) => c.status === 'warn')

    const holding = !checks.some((c) => c.status === 'bad')
    if (holding) this.holdStart ??= now
    else this.holdStart = null
    const holdSeconds = this.holdStart === null ? 0 : (now - this.holdStart) / 1000
    this.bestHold = Math.max(this.bestHold, holdSeconds)

    return { phase: 'checking', checks, score, topIssue, holdSeconds, bestHold: this.bestHold }
  }

  private idleChecks(): CheckView[] {
    return this.pose.checks.map((c) => ({ id: c.id, label: c.label, status: 'unknown', joints: [] }))
  }

  /** Only switch a check's displayed status once the new status has persisted for a moment. */
  private debounce(view: CheckView, now: number): CheckView {
    const t = this.tracked.get(view.id)
    if (!t || this.debounceMs === 0 || t.shown.status === view.status) {
      this.tracked.set(view.id, { shown: view })
      return view
    }
    if (!t.pending || t.pending.status !== view.status) t.pending = { status: view.status, since: now }
    if (now - t.pending.since >= this.debounceMs) {
      this.tracked.set(view.id, { shown: view })
      return view
    }
    // Keep the old status, but refresh the measurement so the numbers stay live.
    t.shown = { ...t.shown, detail: view.detail }
    return t.shown
  }
}

/** Exponential smoothing of landmark positions; visibility is always the latest value. */
export class Smoother {
  private prev: PoseFrame | null = null

  /** @param alpha weight of the newest frame (1 = no smoothing). */
  constructor(private alpha = 0.5) {}

  reset() {
    this.prev = null
  }

  push(frame: PoseFrame): PoseFrame {
    const prev = this.prev
    const a = this.alpha
    if (!prev || a >= 1) return (this.prev = frame)
    const mix = (cur: Point[], old: Point[]) =>
      cur.map((p, i) => {
        const o = old[i] ?? p
        return {
          x: o.x + a * (p.x - o.x),
          y: o.y + a * (p.y - o.y),
          z: o.z + a * (p.z - o.z),
          visibility: p.visibility,
        }
      })
    return (this.prev = { image: mix(frame.image, prev.image), world: mix(frame.world, prev.world) })
  }
}
