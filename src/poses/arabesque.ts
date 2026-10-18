import { SIDES, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angleFromVertical, midpoint } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import { LOWER_BODY, NOT_VISIBLE_HINT, isVisible, legLength, nearSide, pointedFoot, straightLeg, jointAngle } from './common'

interface ArabesqueCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  working: SideIndices
  standing: SideIndices
  near: SideIndices
  /** +1 if the dancer faces toward larger x, -1 otherwise. */
  facing: number
}

const DEG = 180 / Math.PI

export const arabesque = definePose<ArabesqueCtx>({
  id: 'arabesque',
  name: 'Arabesque',
  category: 'Ballet',
  emoji: '🦢',
  summary: 'Balance on one straight leg with the other extended long behind you and the front arm reaching forward.',
  cameraTip: 'Stand side-on to the camera, 2–3 m away, so it sees your profile from fingertips to back foot.',
  cues: [
    'Standing leg pulled up and straight',
    'Back leg fully stretched from hip to toe',
    'Back leg lifted (aim for hip height)',
    'Foot pointed',
    'Chest lifted, back long',
    'Front arm reaching forward at shoulder height',
  ],

  prepare(frame) {
    // The far leg is partly hidden in profile, so accept lower visibility for the legs.
    if (!isVisible(frame, LOWER_BODY, 0.3)) return { ready: false, hint: NOT_VISIBLE_HINT }
    const img = frame.image
    const workingSide = img[SIDES.left.ankle]!.y < img[SIDES.right.ankle]!.y ? 'left' : 'right'
    const working = SIDES[workingSide]
    const standing = SIDES[workingSide === 'left' ? 'right' : 'left']
    const length = legLength(img, standing)
    const hips = midpoint(img[working.hip]!, img[standing.hip]!)
    const lift = (img[standing.ankle]!.y - img[working.ankle]!.y) / length
    const reach = Math.abs(img[working.ankle]!.x - hips.x) / length
    if (lift < 0.25 || reach < 0.4) {
      return { ready: false, hint: 'Stand side-on to the camera and extend one leg straight behind you.' }
    }
    const facing = -Math.sign(img[working.ankle]!.x - hips.x) || 1
    const near = SIDES[nearSide(frame)]
    return { ready: true, ctx: { frame, img, world: frame.world, working, standing, near, facing } }
  },

  checks: [
    {
      id: 'standing-leg',
      label: 'Standing leg straight',
      evaluate: ({ frame, standing }) =>
        straightLeg(frame, standing, 'Straighten your standing leg: pull up through the knee.'),
    },
    {
      id: 'working-leg',
      label: 'Back leg stretched',
      evaluate: ({ frame, working }) =>
        straightLeg(frame, working, 'Straighten your back leg all the way through the knee.', {
          good: [163, 180],
          tolerance: 10,
        }),
    },
    {
      id: 'leg-height',
      label: 'Back leg lifted',
      evaluate({ img, working }): CheckResult {
        const hip = img[working.hip]!
        const ankle = img[working.ankle]!
        // 0° = leg horizontal (hip height), negative = below.
        const elevation = Math.atan2(hip.y - ankle.y, Math.abs(ankle.x - hip.x)) * DEG
        const { status, direction } = grade(elevation, { good: [-15, 35], tolerance: 20 })
        return {
          status,
          detail: elevation >= 0 ? `${fmtDeg(elevation)} above hip` : `${fmtDeg(-elevation)} below hip`,
          message:
            direction === 'low'
              ? 'Lift your back leg higher, reaching long out of the hip.'
              : 'Lower your leg a little and keep your hips square.',
          joints: [working.hip, working.knee, working.ankle],
        }
      },
    },
    {
      id: 'pointed-foot',
      label: 'Back foot pointed',
      evaluate: ({ frame, working }) => pointedFoot(frame, working, 'Point your back foot all the way through the toes.'),
    },
    {
      id: 'chest',
      label: 'Chest lifted',
      evaluate({ img, near }): CheckResult {
        const lean = angleFromVertical(img[near.hip]!, img[near.shoulder]!)
        return {
          status: grade(lean, { good: [0, 30], tolerance: 15 }).status,
          detail: `${fmtDeg(lean)} forward`,
          message: 'Lift your chest: keep your back long instead of tipping forward.',
          joints: [near.shoulder, near.hip],
        }
      },
    },
    {
      id: 'front-arm',
      label: 'Front arm reaching forward',
      evaluate({ frame, img, world, facing }): CheckResult {
        const arms = [SIDES.left, SIDES.right].filter((s) => isVisible(frame, [s.shoulder, s.elbow, s.wrist], 0.3))
        if (arms.length === 0) return { status: 'unknown', detail: 'arms not visible' }
        const front = arms.reduce((a, b) => (img[b.wrist]!.x * facing > img[a.wrist]!.x * facing ? b : a))
        const shoulder = img[front.shoulder]!
        const wrist = img[front.wrist]!
        const forward = (wrist.x - shoulder.x) * facing
        const elevation = Math.atan2(shoulder.y - wrist.y, Math.max(forward, 1e-6)) * DEG
        const height = grade(forward > 0 ? elevation : -90, { good: [-20, 35], tolerance: 15 })
        const elbow = jointAngle(frame, front.shoulder, front.elbow, front.wrist)
        const length = grade(elbow, { good: [150, 180], tolerance: 15 })
        const joints = [front.shoulder, front.elbow, front.wrist]
        if (height.status !== 'good') {
          return {
            status: height.status,
            detail: `${fmtDeg(elevation)} from shoulder height`,
            message: 'Reach your front arm forward at shoulder height.',
            joints,
          }
        }
        return {
          status: length.status,
          detail: `elbow ${fmtDeg(elbow)}`,
          message: 'Lengthen your front arm: reach through the fingertips.',
          joints,
        }
      },
    },
  ],
})
