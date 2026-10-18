import { L, SIDES, type Point, type SideIndices } from '@/pose/landmarks'
import { midpoint } from '@/pose/geometry'
import type { CheckStatus } from '@/poses/types'

/**
 * Compares the user's pose with the teacher's *as both appear on screen*: if the
 * teacher's arm on the left of the screen is up, the user's arm on the left of
 * their (mirrored) camera view should be up too. This works whichever way the
 * teacher video and the selfie view are mirrored.
 */

export type Part = 'arm' | 'hand' | 'knee' | 'foot' | 'torso'

interface LimbDef {
  part: Exclude<Part, 'torso'>
  from: keyof SideIndices
  to: keyof SideIndices
  weight: number
  /** Arms are assigned to screen sides by the shoulders, legs by the hips. */
  anchor: 'shoulder' | 'hip'
}

const LIMBS: LimbDef[] = [
  { part: 'arm', from: 'shoulder', to: 'elbow', weight: 1, anchor: 'shoulder' },
  { part: 'hand', from: 'elbow', to: 'wrist', weight: 0.7, anchor: 'shoulder' },
  { part: 'knee', from: 'hip', to: 'knee', weight: 1, anchor: 'hip' },
  { part: 'foot', from: 'knee', to: 'ankle', weight: 0.8, anchor: 'hip' },
]
const TORSO_WEIGHT = 1.2
const MIN_VIS = 0.5

export interface View {
  points: Point[]
  /** True when this video is shown mirrored on screen. */
  flipped: boolean
}

export interface LimbDiff {
  part: Part
  /** The user's own side for this limb (null for the torso). */
  side: 'left' | 'right' | null
  /** Angle between the user's and the teacher's limb, in degrees. */
  error: number
  /** A short correction, e.g. "Lift your right arm higher". */
  hint: string
  /** The user's landmarks for this limb. */
  joints: number[]
}

export interface Comparison {
  /** 0–100. */
  score: number
  /** Worst first. */
  limbs: LimbDiff[]
}

type Vec = [number, number]

const vec = (p: Point, q: Point, flipped: boolean): Vec => [(q.x - p.x) * (flipped ? -1 : 1), q.y - p.y]
const unit = ([x, y]: Vec): Vec => {
  const n = Math.hypot(x, y) || 1
  return [x / n, y / n]
}
const angleBetween = (a: Vec, b: Vec) => {
  const [ua, ub] = [unit(a), unit(b)]
  return (Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1]))) * 180) / Math.PI
}
/** 0° = pointing straight down, 180° = straight up. */
const fromDown = ([x, y]: Vec) => (Math.atan2(Math.abs(x), y) * 180) / Math.PI

const visible = (pts: Point[], ...idx: number[]) => idx.every((i) => (pts[i]?.visibility ?? 1) >= MIN_VIS)

/** The body sides that appear on the left and right of the screen, judged by a pair of anchor joints. */
function screenSides(view: View, anchor: 'shoulder' | 'hip'): { left: SideIndices; right: SideIndices } {
  const lx = view.points[SIDES.left[anchor]]!.x * (view.flipped ? -1 : 1)
  const rx = view.points[SIDES.right[anchor]]!.x * (view.flipped ? -1 : 1)
  return lx <= rx ? { left: SIDES.left, right: SIDES.right } : { left: SIDES.right, right: SIDES.left }
}

const PHRASES: Record<Exclude<Part, 'torso'>, Record<'higher' | 'lower' | 'out' | 'in', string>> = {
  arm: {
    higher: 'Lift your {side} arm higher',
    lower: 'Lower your {side} arm',
    out: 'Open your {side} arm out wider',
    in: 'Bring your {side} arm in closer',
  },
  hand: {
    higher: 'Lift your {side} hand higher',
    lower: 'Lower your {side} hand',
    out: 'Reach your {side} hand further out',
    in: 'Bring your {side} hand in closer',
  },
  knee: {
    higher: 'Lift your {side} knee higher',
    lower: 'Lower your {side} knee',
    out: 'Open your {side} knee out more',
    in: 'Bring your {side} knee in',
  },
  foot: {
    higher: 'Lift your {side} foot higher',
    lower: 'Lower your {side} foot',
    out: 'Take your {side} foot further out',
    in: 'Bring your {side} foot in',
  },
}

function direction(user: Vec, teacher: Vec, screenSide: 'left' | 'right'): 'higher' | 'lower' | 'out' | 'in' {
  const du = fromDown(user)
  const dt = fromDown(teacher)
  if (du < dt - 20) return 'higher'
  if (du > dt + 20) return 'lower'
  const outward = screenSide === 'left' ? -1 : 1
  return unit(user)[0] * outward < unit(teacher)[0] * outward ? 'out' : 'in'
}

/** Per-limb score: within 20° is perfect, 70° or more scores nothing. */
const limbScore = (error: number) => Math.max(0, Math.min(1, 1 - (error - 20) / 50))

export function compare(user: View, teacher: View): Comparison | null {
  const limbs: LimbDiff[] = []
  let total = 0
  let weights = 0
  const scores: number[] = []

  for (const def of LIMBS) {
    const us = screenSides(user, def.anchor)
    const ts = screenSides(teacher, def.anchor)
    for (const screenSide of ['left', 'right'] as const) {
      const u = us[screenSide]
      const t = ts[screenSide]
      if (!visible(user.points, u[def.from], u[def.to]) || !visible(teacher.points, t[def.from], t[def.to])) continue
      const vu = vec(user.points[u[def.from]]!, user.points[u[def.to]]!, user.flipped)
      const vt = vec(teacher.points[t[def.from]]!, teacher.points[t[def.to]]!, teacher.flipped)
      const error = angleBetween(vu, vt)
      const side = u === SIDES.left ? 'left' : 'right'
      limbs.push({
        part: def.part,
        side,
        error,
        hint: PHRASES[def.part][direction(vu, vt, screenSide)].replace('{side}', side),
        joints: [u[def.from], u[def.to]],
      })
      total += def.weight * limbScore(error)
      weights += def.weight
      scores.push(limbScore(error))
    }
  }

  const torsoIdx = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP]
  if (visible(user.points, ...torsoIdx) && visible(teacher.points, ...torsoIdx)) {
    const torso = (v: View) =>
      vec(
        midpoint(v.points[L.LEFT_HIP]!, v.points[L.RIGHT_HIP]!),
        midpoint(v.points[L.LEFT_SHOULDER]!, v.points[L.RIGHT_SHOULDER]!),
        v.flipped,
      )
    const vu = torso(user)
    const vt = torso(teacher)
    const error = angleBetween(vu, vt)
    const leanU = 180 - fromDown(vu)
    const leanT = 180 - fromDown(vt)
    limbs.push({
      part: 'torso',
      side: null,
      error,
      hint: leanU < leanT ? 'Lean your body more, like the teacher' : 'Keep your body more upright',
      joints: torsoIdx,
    })
    total += TORSO_WEIGHT * limbScore(error)
    weights += TORSO_WEIGHT
    scores.push(limbScore(error))
  }

  if (weights < 2) return null // too little of the user (or teacher) visible to judge
  // Upper arm / thigh / torso win near-ties, so "lift your arm" beats "lift your hand"
  // when the whole arm is off.
  const proximal = (l: LimbDiff) => (l.part === 'hand' || l.part === 'foot' ? 0 : 10)
  limbs.sort((a, b) => b.error + proximal(b) - (a.error + proximal(a)))
  // Blend the average with the two worst limbs: a missed arm movement should cost
  // real points even though one arm is a small share of the body.
  const worstTwo = [...scores].sort((a, b) => a - b).slice(0, 2)
  const worst = worstTwo.reduce((a, b) => a + b, 0) / worstTwo.length
  return { score: Math.round((0.6 * (total / weights) + 0.4 * worst) * 100), limbs }
}

/** Skeleton colours for the user's limbs. */
export function limbStatuses(c: Comparison): Map<number, CheckStatus> {
  const out = new Map<number, CheckStatus>()
  // Best limbs first so a joint shared by a good and a bad limb ends up showing the problem.
  for (const l of [...c.limbs].reverse()) {
    const status: CheckStatus = l.error < 25 ? 'good' : l.error < 45 ? 'warn' : 'bad'
    for (const j of l.joints) out.set(j, status)
  }
  return out
}

/**
 * The teacher's pose moved and scaled onto the user's body, in the user's raw camera
 * coordinates, so it can be drawn as a "ghost" to match.
 */
export function ghostPose(user: View, teacher: View): Point[] | null {
  const anchor = (v: View) => {
    const hips = midpoint(v.points[L.LEFT_HIP]!, v.points[L.RIGHT_HIP]!)
    const shoulders = midpoint(v.points[L.LEFT_SHOULDER]!, v.points[L.RIGHT_SHOULDER]!)
    return { hips, size: Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y) }
  }
  const torsoIdx = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP]
  if (!visible(user.points, ...torsoIdx) || !visible(teacher.points, ...torsoIdx)) return null
  const u = anchor(user)
  const t = anchor(teacher)
  if (t.size === 0) return null
  const scale = u.size / t.size
  // Offsets are mirrored when exactly one of the two views is flipped on screen.
  const sx = user.flipped === teacher.flipped ? 1 : -1
  return teacher.points.map((p) => ({
    x: u.hips.x + (p.x - t.hips.x) * scale * sx,
    y: u.hips.y + (p.y - t.hips.y) * scale,
    z: 0,
    visibility: p.visibility,
  }))
}
