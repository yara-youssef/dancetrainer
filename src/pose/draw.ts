import { CONNECTIONS, type Point } from './landmarks'
import type { CheckStatus } from '@/poses/types'

const COLORS: Record<CheckStatus, string> = {
  good: '#34d399',
  warn: '#fbbf24',
  bad: '#f87171',
  unknown: 'rgba(255,255,255,0.85)',
}

/**
 * Draws the skeleton. `points` are image landmarks in aspect-corrected units
 * (y in 0..1, x in 0..aspect); `joints` colours specific landmarks by status.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  points: Point[] | null,
  joints: Map<number, CheckStatus>,
) {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)
  if (!points) return
  const px = (p: Point) => [p.x * height, p.y * height] as const
  const visible = (p: Point | undefined): p is Point => !!p && (p.visibility ?? 1) > 0.4
  const lineWidth = Math.max(3, height / 160)

  ctx.lineCap = 'round'
  for (const [a, b] of CONNECTIONS) {
    const pa = points[a]
    const pb = points[b]
    if (!visible(pa) || !visible(pb)) continue
    const sa = joints.get(a)
    const sb = joints.get(b)
    const status = sa && sa === sb ? sa : 'unknown'
    ctx.strokeStyle = COLORS[status]
    ctx.lineWidth = status === 'unknown' ? lineWidth : lineWidth * 1.8
    ctx.beginPath()
    ctx.moveTo(...px(pa))
    ctx.lineTo(...px(pb))
    ctx.stroke()
  }
  points.forEach((p, i) => {
    if (i > 0 && i < 11) return // skip face detail except the nose
    if (!visible(p)) return
    const status = joints.get(i) ?? 'unknown'
    ctx.fillStyle = COLORS[status]
    ctx.beginPath()
    ctx.arc(...px(p), status === 'unknown' ? lineWidth * 1.3 : lineWidth * 2.2, 0, Math.PI * 2)
    ctx.fill()
  })
}

/** Colour joints by the worst status of the checks that mention them. */
export function jointStatuses(checks: { status: CheckStatus; joints: number[] }[]): Map<number, CheckStatus> {
  const rank: Record<CheckStatus, number> = { unknown: 0, good: 1, warn: 2, bad: 3 }
  const out = new Map<number, CheckStatus>()
  for (const c of checks) {
    if (c.status === 'unknown') continue
    for (const j of c.joints) {
      const cur = out.get(j)
      if (!cur || rank[c.status] > rank[cur]) out.set(j, c.status)
    }
  }
  return out
}

/** Draws a target pose (the teacher's "ghost") on top of what's already on the canvas. */
export function drawGhost(ctx: CanvasRenderingContext2D, points: Point[]) {
  const { height } = ctx.canvas
  const px = (p: Point) => [p.x * height, p.y * height] as const
  const visible = (p: Point | undefined): p is Point => !!p && (p.visibility ?? 1) > 0.4
  const lineWidth = Math.max(4, height / 110)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = 6
  ctx.lineWidth = lineWidth
  ctx.setLineDash([lineWidth * 1.5, lineWidth * 1.5])
  for (const [a, b] of CONNECTIONS) {
    const pa = points[a]
    const pb = points[b]
    if (!visible(pa) || !visible(pb)) continue
    ctx.beginPath()
    ctx.moveTo(...px(pa))
    ctx.lineTo(...px(pb))
    ctx.stroke()
  }
  ctx.restore()
}
