import { L, SIDES, type Point, type PoseFrame, type Side, type SideIndices } from '@/pose/landmarks'
import { angle2d, angle3d, angleFromHorizontal, angleFromVertical, dist2d, midpoint } from '@/pose/geometry'
import { fmtDeg, grade, type Band, type CheckResult } from './types'

export const MIN_VISIBILITY = 0.5

export function isVisible(frame: PoseFrame, indices: number[], min = MIN_VISIBILITY): boolean {
  return indices.every((i) => (frame.image[i]?.visibility ?? 1) >= min)
}

/** For side-view poses: the side of the body facing the camera (most visible). */
export function nearSide(frame: PoseFrame): Side {
  const score = (s: SideIndices) =>
    Object.values(s).reduce((sum, i) => sum + (frame.image[i]?.visibility ?? 0), 0)
  return score(SIDES.left) >= score(SIDES.right) ? 'left' : 'right'
}

export const NOT_VISIBLE_HINT = 'Step back so your whole body, including your feet, is in the frame.'

export const LOWER_BODY = [L.LEFT_HIP, L.RIGHT_HIP, L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ANKLE, L.RIGHT_ANKLE]
export const SHOULDERS = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER]

/** Returns a hint if the person is side-on, for poses that need them facing the camera. */
export function facingCameraHint(img: Point[], poseName: string): string | null {
  const shoulderWidth = dist2d(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
  const torso = dist2d(
    midpoint(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!),
    midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!),
  )
  return torso === 0 || shoulderWidth / torso < 0.35 ? `Turn to face the camera for ${poseName} feedback.` : null
}

/** Hip-to-ankle length of one leg in image units, used to normalise distances. */
export function legLength(img: Point[], s: SideIndices): number {
  return dist2d(img[s.hip]!, img[s.knee]!) + dist2d(img[s.knee]!, img[s.ankle]!)
}

/** Toe position, falling back to the ankle when the foot landmark is unreliable. */
export function toePoint(img: Point[], s: SideIndices): Point {
  const foot = img[s.foot]!
  return (foot.visibility ?? 1) >= MIN_VISIBILITY ? foot : img[s.ankle]!
}

/**
 * Angle at joint b (knee, elbow…). Uses the larger of the 2D image angle and the 3D
 * world angle: a straight limb always projects as straight, while MediaPipe's depth
 * estimate tends to under-read straight limbs by 20–30°.
 */
export function jointAngle(frame: PoseFrame, a: number, b: number, c: number): number {
  const img = frame.image
  const w = frame.world
  return Math.max(angle2d(img[a]!, img[b]!, img[c]!), angle3d(w[a]!, w[b]!, w[c]!))
}

export function miss(v: number, [lo, hi]: [number, number]): number {
  return v < lo ? lo - v : v > hi ? v - hi : 0
}

// ---- Checks shared between poses -------------------------------------------------

export function straightLeg(
  frame: PoseFrame,
  s: SideIndices,
  message: string,
  band: Band = { good: [167, 180], tolerance: 9 },
): CheckResult {
  const knee = jointAngle(frame, s.hip, s.knee, s.ankle)
  return { status: grade(knee, band).status, detail: fmtDeg(knee), message, joints: [s.hip, s.knee, s.ankle] }
}

export function straightArm(frame: PoseFrame, s: SideIndices, message: string, band: Band): CheckResult {
  const elbow = jointAngle(frame, s.shoulder, s.elbow, s.wrist)
  return { status: grade(elbow, band).status, detail: fmtDeg(elbow), message, joints: [s.shoulder, s.elbow, s.wrist] }
}

export function pointedFoot(frame: PoseFrame, s: SideIndices, message?: string): CheckResult {
  if (!isVisible(frame, [s.foot, s.heel])) return { status: 'unknown', detail: 'foot not visible' }
  const point = angle3d(frame.world[s.knee]!, frame.world[s.ankle]!, frame.world[s.foot]!)
  return {
    status: grade(point, { good: [140, 180], tolerance: 18 }).status,
    detail: fmtDeg(point),
    message: message ?? 'Point your foot: stretch through the arch and toes.',
    joints: [s.ankle, s.foot],
  }
}

/** Hips level. With a working side, the message says which way the hips tilt. */
export function hipsLevel(img: Point[], working?: SideIndices, standing?: SideIndices): CheckResult {
  const a = working ?? SIDES.left
  const b = standing ?? SIDES.right
  const tilt = angleFromHorizontal(img[a.hip]!, img[b.hip]!)
  const workingHipHigh = img[a.hip]!.y < img[b.hip]!.y
  return {
    status: grade(tilt, { good: [0, 6], tolerance: 5 }).status,
    detail: fmtDeg(tilt),
    message: !working
      ? 'Keep your hips level and square.'
      : workingHipHigh
        ? "Keep your hips square: don't hitch up the working hip."
        : "Keep your hips level: don't sink into the standing hip.",
    joints: [a.hip, b.hip],
  }
}

/** Front view: shoulders stacked over hips. */
export function torsoUpright(img: Point[], message = 'Stand tall: stack your shoulders over your hips.'): CheckResult {
  const shoulders = midpoint(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
  const hips = midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!)
  const lean = angleFromVertical(hips, shoulders)
  return {
    status: grade(lean, { good: [0, 7], tolerance: 6 }).status,
    detail: fmtDeg(lean),
    message,
    joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
  }
}

export function shouldersLevel(img: Point[]): CheckResult {
  const tilt = angleFromHorizontal(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
  return {
    status: grade(tilt, { good: [0, 5], tolerance: 5 }).status,
    detail: fmtDeg(tilt),
    message: 'Level your shoulders and relax them down.',
    joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
  }
}

/** Both visible arms softly curved (ballet first/fifth/second), reporting the worst arm. */
export function roundedArms(frame: PoseFrame, band: Band = { good: [115, 165], tolerance: 10 }): CheckResult {
  const arms = [SIDES.left, SIDES.right].filter((s) => isVisible(frame, [s.shoulder, s.elbow, s.wrist]))
  if (arms.length === 0) return { status: 'unknown', detail: 'arms not visible' }
  const angles = arms.map((s) => jointAngle(frame, s.shoulder, s.elbow, s.wrist))
  const worst = angles.reduce((a, b) => (miss(b, band.good) > miss(a, band.good) ? b : a))
  const { status, direction } = grade(worst, band)
  return {
    status,
    detail: angles.map(fmtDeg).join(' / '),
    message:
      direction === 'high'
        ? 'Round your arms: soften the elbows into a gentle curve.'
        : 'Your elbows are too bent: widen the curve of your arms.',
    joints: arms.flatMap((s) => [s.shoulder, s.elbow, s.wrist]),
  }
}

/** Front view, balancing on one leg: picks the working (lifted) leg. */
export function oneLegSides(img: Point[]) {
  const workingSide: Side = img[L.LEFT_ANKLE]!.y < img[L.RIGHT_ANKLE]!.y ? 'left' : 'right'
  const working = SIDES[workingSide]
  const standing = SIDES[workingSide === 'left' ? 'right' : 'left']
  return { workingSide, working, standing }
}

/** Distance between the shoulders and the hips (midpoints), in image units. */
export function torsoLength(img: Point[]): number {
  return dist2d(
    midpoint(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!),
    midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!),
  )
}

/**
 * Front view: wrists at a given height relative to the shoulders, reporting the
 * worst arm. `drop` is (wrist below shoulder) / torso length.
 */
export function armHeight(
  frame: PoseFrame,
  band: Band,
  messages: { tooLow: string; tooHigh: string },
): CheckResult {
  const img = frame.image
  const arms = [SIDES.left, SIDES.right].filter((s) => isVisible(frame, [s.shoulder, s.wrist]))
  if (arms.length === 0) return { status: 'unknown', detail: 'arms not visible' }
  const torso = torsoLength(img)
  const drops = arms.map((s) => (img[s.wrist]!.y - img[s.shoulder]!.y) / torso)
  const worst = drops.reduce((a, b) => (miss(b, band.good) > miss(a, band.good) ? b : a))
  const { status, direction } = grade(worst, band)
  return {
    status,
    detail: drops.map((d) => `${Math.round(Math.abs(d) * 100)}% ${d >= 0 ? 'below' : 'above'}`).join(' / '),
    message: direction === 'high' ? messages.tooLow : messages.tooHigh,
    joints: arms.flatMap((s) => [s.shoulder, s.elbow, s.wrist]),
  }
}
