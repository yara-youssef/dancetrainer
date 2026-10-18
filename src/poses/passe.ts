import { L, SIDES, otherSide, type Point, type PoseFrame, type Side, type SideIndices } from '@/pose/landmarks'
import { angle3d, angleFromHorizontal, angleFromVertical, dist2d, midpoint } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import { MIN_VISIBILITY, NOT_VISIBLE_HINT, isVisible } from './common'

interface PasseCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  working: SideIndices
  standing: SideIndices
  workingSide: Side
  /** Standing-leg length in image units, used to normalise distances. */
  legLength: number
}

const LOWER_BODY = [L.LEFT_HIP, L.RIGHT_HIP, L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ANKLE, L.RIGHT_ANKLE]
const UPPER_BODY = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER]

export const passe = definePose<PasseCtx>({
  id: 'passe',
  name: 'Passé (retiré)',
  category: 'Ballet',
  emoji: '🩰',
  summary: 'Balance on one leg with the working toe drawn up to the standing knee, knee turned out.',
  cameraTip: 'Face the camera, about 2–3 m away, with your whole body (feet included) in view.',
  cues: [
    'Standing leg pulled up and straight',
    'Working toe at the side of the standing knee',
    'Working knee opened out to the side (turnout)',
    'Working foot pointed',
    'Hips and shoulders square and level',
    'Arms softly rounded',
  ],

  prepare(frame) {
    if (!isVisible(frame, [...LOWER_BODY, ...UPPER_BODY])) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const left = SIDES.left
    const right = SIDES.right

    const shoulderWidth = dist2d(img[left.shoulder]!, img[right.shoulder]!)
    const torso = dist2d(
      midpoint(img[left.shoulder]!, img[right.shoulder]!),
      midpoint(img[left.hip]!, img[right.hip]!),
    )
    if (torso === 0 || shoulderWidth / torso < 0.35) {
      return { ready: false, hint: 'Turn to face the camera for passé feedback.' }
    }

    // The working leg is the one whose ankle is higher (smaller y).
    const workingSide: Side = img[left.ankle]!.y < img[right.ankle]!.y ? 'left' : 'right'
    const working = SIDES[workingSide]
    const standing = SIDES[otherSide(workingSide)]
    const legLength =
      dist2d(img[standing.hip]!, img[standing.knee]!) + dist2d(img[standing.knee]!, img[standing.ankle]!)

    const lift = (img[standing.ankle]!.y - img[working.ankle]!.y) / legLength
    if (lift < 0.2) {
      return { ready: false, hint: 'Draw one foot up your standing leg to your knee.' }
    }
    return { ready: true, ctx: { frame, img, world: frame.world, working, standing, workingSide, legLength } }
  },

  checks: [
    {
      id: 'standing-leg',
      label: 'Standing leg straight',
      evaluate({ world, standing }): CheckResult {
        const knee = angle3d(world[standing.hip]!, world[standing.knee]!, world[standing.ankle]!)
        const { status } = grade(knee, { good: [167, 180], tolerance: 9 })
        return {
          status,
          detail: fmtDeg(knee),
          message: 'Straighten your standing leg: pull up through the knee.',
          joints: [standing.hip, standing.knee, standing.ankle],
        }
      },
    },
    {
      id: 'passe-height',
      label: 'Toe at the standing knee',
      evaluate({ img, working, standing, legLength }): CheckResult {
        const toe = toePoint(img, working)
        // Positive = toe is below the standing knee.
        const drop = (toe.y - img[standing.knee]!.y) / legLength
        const { status, direction } = grade(drop, { good: [-0.12, 0.07], tolerance: 0.07 })
        return {
          status,
          detail: `${Math.round(drop * 100)}% of leg ${drop >= 0 ? 'below' : 'above'} knee`,
          message:
            direction === 'high'
              ? 'Lift your working knee higher: bring your toe up to your standing knee.'
              : 'Your foot is a bit high: the toe should sit at the knee.',
          joints: [working.knee, working.ankle, working.foot, standing.knee],
        }
      },
    },
    {
      id: 'turnout',
      label: 'Working knee turned out',
      evaluate({ img, working, standing }): CheckResult {
        const outward = Math.sign(img[working.hip]!.x - img[standing.hip]!.x) || 1
        const thigh = dist2d(img[standing.hip]!, img[standing.knee]!)
        const open = ((img[working.knee]!.x - img[working.hip]!.x) * outward) / thigh
        const { status } = grade(open, { good: [0.5, 5], tolerance: 0.18 })
        return {
          status,
          detail: `knee ${Math.round(open * 100)}% of a thigh out to the side`,
          message: 'Open your working knee out to the side: rotate from the hip.',
          joints: [working.hip, working.knee],
        }
      },
    },
    {
      id: 'pointed-foot',
      label: 'Working foot pointed',
      evaluate({ frame, world, working }): CheckResult {
        if (!isVisible(frame, [working.foot, working.heel], MIN_VISIBILITY)) {
          return { status: 'unknown', detail: 'foot not visible' }
        }
        const point = angle3d(world[working.knee]!, world[working.ankle]!, world[working.foot]!)
        const { status } = grade(point, { good: [140, 180], tolerance: 18 })
        return {
          status,
          detail: fmtDeg(point),
          message: 'Point your working foot: stretch through the arch and toes.',
          joints: [working.ankle, working.foot],
        }
      },
    },
    {
      id: 'hips-level',
      label: 'Hips level',
      evaluate({ img, working, standing }): CheckResult {
        const tilt = angleFromHorizontal(img[working.hip]!, img[standing.hip]!)
        const { status } = grade(tilt, { good: [0, 6], tolerance: 5 })
        const workingHipHigh = img[working.hip]!.y < img[standing.hip]!.y
        return {
          status,
          detail: fmtDeg(tilt),
          message: workingHipHigh
            ? "Keep your hips square: don't hitch up the working hip."
            : "Keep your hips level: don't sink into the standing hip.",
          joints: [working.hip, standing.hip],
        }
      },
    },
    {
      id: 'torso-upright',
      label: 'Torso upright',
      evaluate({ img }): CheckResult {
        const shoulders = midpoint(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
        const hips = midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!)
        const lean = angleFromVertical(hips, shoulders)
        const { status } = grade(lean, { good: [0, 7], tolerance: 6 })
        return {
          status,
          detail: fmtDeg(lean),
          message: 'Stand tall: stack your shoulders over your hips.',
          joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
        }
      },
    },
    {
      id: 'shoulders-level',
      label: 'Shoulders level and down',
      evaluate({ img }): CheckResult {
        const tilt = angleFromHorizontal(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
        const { status } = grade(tilt, { good: [0, 5], tolerance: 5 })
        return {
          status,
          detail: fmtDeg(tilt),
          message: 'Level your shoulders and relax them down.',
          joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
        }
      },
    },
    {
      id: 'rounded-arms',
      label: 'Arms softly rounded',
      evaluate({ frame, world }): CheckResult {
        const arms = [SIDES.left, SIDES.right].filter((s) => isVisible(frame, [s.shoulder, s.elbow, s.wrist]))
        if (arms.length === 0) return { status: 'unknown', detail: 'arms not visible' }
        const angles = arms.map((s) => angle3d(world[s.shoulder]!, world[s.elbow]!, world[s.wrist]!))
        const band = { good: [115, 165] as [number, number], tolerance: 10 }
        // Report the arm that is furthest from the band.
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
      },
    },
  ],
})

function miss(v: number, [lo, hi]: [number, number]): number {
  return v < lo ? lo - v : v > hi ? v - hi : 0
}

/** Toe position, falling back to the ankle when the foot landmark is unreliable. */
function toePoint(img: Point[], side: SideIndices): Point {
  const foot = img[side.foot]!
  return (foot.visibility ?? 1) >= MIN_VISIBILITY ? foot : img[side.ankle]!
}
