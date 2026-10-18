import { SIDES, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angle3d, angle2d, angleFromHorizontal, angleFromVertical, offsetBelowLine } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import { NOT_VISIBLE_HINT, isVisible, nearSide } from './common'

interface PlankCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  s: SideIndices
  /** Forearm plank (elbows on the floor) instead of a high plank on the hands. */
  forearm: boolean
  /** +1 if the head is toward larger x, -1 otherwise. */
  headDir: number
}

export const plank = definePose<PlankCtx>({
  id: 'plank',
  name: 'Plank',
  category: 'Strength',
  emoji: '🧱',
  summary: 'One straight line from head to heels, supported on straight arms (or forearms).',
  cameraTip: 'Put the camera at floor height to your side, so it sees you in profile from head to heels.',
  cues: [
    'Hands (or elbows) directly under the shoulders',
    'Shoulders, hips and heels in one straight line',
    "Don't let the hips sag or pike up",
    'Legs straight and strong',
    'Neck long: head in line with the spine',
  ],

  prepare(frame) {
    const s = SIDES[nearSide(frame)]
    if (!isVisible(frame, [s.shoulder, s.elbow, s.wrist, s.hip, s.knee, s.ankle])) {
      return { ready: false, hint: NOT_VISIBLE_HINT }
    }
    const img = frame.image
    const horizontal = angleFromHorizontal(img[s.shoulder]!, img[s.ankle]!) < 35
    const supported = img[s.wrist]!.y > img[s.shoulder]!.y && img[s.elbow]!.y > img[s.shoulder]!.y
    if (!horizontal || !supported) {
      return { ready: false, hint: 'Get into a plank: hands under shoulders, body in one long line.' }
    }
    const forearm = angle3d(frame.world[s.shoulder]!, frame.world[s.elbow]!, frame.world[s.wrist]!) < 130
    const headDir = Math.sign(img[s.shoulder]!.x - img[s.ankle]!.x) || 1
    return { ready: true, ctx: { frame, img, world: frame.world, s, forearm, headDir } }
  },

  checks: [
    {
      id: 'body-line',
      label: 'Hips in line with shoulders and heels',
      evaluate({ img, s }): CheckResult {
        const line = angle2d(img[s.shoulder]!, img[s.hip]!, img[s.ankle]!)
        const sagging = offsetBelowLine(img[s.hip]!, img[s.shoulder]!, img[s.ankle]!) > 0
        const { status } = grade(line, { good: [168, 180], tolerance: 9 })
        return {
          status,
          detail: `${fmtDeg(line)}, hips ${sagging ? 'low' : 'high'}`,
          message: sagging
            ? 'Your hips are sagging: squeeze your glutes and draw your belly in.'
            : 'Lower your hips into one line with your shoulders and heels.',
          joints: [s.shoulder, s.hip, s.ankle],
        }
      },
    },
    {
      id: 'stacked',
      label: 'Hands (or elbows) under shoulders',
      evaluate({ img, s, forearm, headDir }): CheckResult {
        const support = forearm ? s.elbow : s.wrist
        const lean = angleFromVertical(img[s.shoulder]!, img[support]!)
        const handsAhead = (img[support]!.x - img[s.shoulder]!.x) * headDir > 0
        const { status } = grade(lean, { good: [0, 13], tolerance: 10 })
        const part = forearm ? 'elbows' : 'hands'
        return {
          status,
          detail: fmtDeg(lean),
          message: handsAhead
            ? `Bring your ${part} back under your shoulders.`
            : `Shift forward so your shoulders stack over your ${part}.`,
          joints: [s.shoulder, support],
        }
      },
    },
    {
      id: 'arms',
      label: 'Arms strong',
      evaluate({ world, s, forearm }): CheckResult {
        const elbow = angle3d(world[s.shoulder]!, world[s.elbow]!, world[s.wrist]!)
        if (forearm) {
          const { status } = grade(elbow, { good: [70, 110], tolerance: 15 })
          return {
            status,
            detail: `${fmtDeg(elbow)} (forearm plank)`,
            message: 'Keep your forearms flat with elbows at a right angle.',
            joints: [s.shoulder, s.elbow, s.wrist],
          }
        }
        const { status } = grade(elbow, { good: [160, 180], tolerance: 10 })
        return {
          status,
          detail: fmtDeg(elbow),
          message: 'Straighten your arms and push the floor away.',
          joints: [s.shoulder, s.elbow, s.wrist],
        }
      },
    },
    {
      id: 'legs-straight',
      label: 'Legs straight',
      evaluate({ world, s }): CheckResult {
        const knee = angle3d(world[s.hip]!, world[s.knee]!, world[s.ankle]!)
        const { status } = grade(knee, { good: [165, 180], tolerance: 10 })
        return {
          status,
          detail: fmtDeg(knee),
          message: 'Straighten your knees and press back through your heels.',
          joints: [s.hip, s.knee, s.ankle],
        }
      },
    },
    {
      id: 'neck',
      label: 'Head in line with the spine',
      evaluate({ frame, img, s }): CheckResult {
        if (!isVisible(frame, [s.ear])) return { status: 'unknown', detail: 'head not visible' }
        const neck = angle2d(img[s.hip]!, img[s.shoulder]!, img[s.ear]!)
        const dropped = offsetBelowLine(img[s.ear]!, img[s.hip]!, img[s.shoulder]!) > 0
        const { status } = grade(neck, { good: [155, 180], tolerance: 13 })
        return {
          status,
          detail: `${fmtDeg(neck)}, head ${dropped ? 'low' : 'high'}`,
          message: dropped
            ? "Don't let your head drop: keep your neck long, in line with your spine."
            : 'Tuck your chin slightly and look at the floor just ahead of your hands.',
          joints: [s.ear, s.shoulder],
        }
      },
    },
  ],
})
