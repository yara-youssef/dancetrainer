import type { Point } from './landmarks'

const DEG = 180 / Math.PI

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function dist2d(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

/** Angle ABC at vertex B in degrees (0..180), using x/y/z. */
export function angle3d(a: Point, b: Point, c: Point): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z]
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z]
  return vectorAngle(v1, v2)
}

/** Angle ABC at vertex B in degrees (0..180), ignoring depth. */
export function angle2d(a: Point, b: Point, c: Point): number {
  return vectorAngle([a.x - b.x, a.y - b.y], [c.x - b.x, c.y - b.y])
}

function vectorAngle(v1: number[], v2: number[]): number {
  let dot = 0
  let n1 = 0
  let n2 = 0
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i]! * v2[i]!
    n1 += v1[i]! ** 2
    n2 += v2[i]! ** 2
  }
  if (n1 === 0 || n2 === 0) return 0
  const cos = Math.min(1, Math.max(-1, dot / Math.sqrt(n1 * n2)))
  return Math.acos(cos) * DEG
}

/** Angle of segment a→b away from vertical, in degrees (0 = vertical, 90 = horizontal). */
export function angleFromVertical(a: Point, b: Point): number {
  return Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * DEG
}

/** Angle of segment a→b away from horizontal, in degrees (0 = horizontal, 90 = vertical). */
export function angleFromHorizontal(a: Point, b: Point): number {
  return 90 - angleFromVertical(a, b)
}

/**
 * Signed perpendicular distance of p from the line a→b in image space.
 * Positive means p lies BELOW the line (larger y), regardless of line direction.
 */
export function offsetBelowLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len === 0) return 0
  const cross = (dx * (p.y - a.y) - dy * (p.x - a.x)) / len
  // cross > 0 means p is clockwise of a→b in y-down coordinates; normalise so
  // that positive always means "below" (toward the floor).
  return dx >= 0 ? cross : -cross
}
