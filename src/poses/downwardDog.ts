import { SIDES, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angle3d, angle2d, angleFromHorizontal, dist2d } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import { NOT_VISIBLE_HINT, isVisible, nearSide } from './common'

interface DogCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  s: SideIndices
  torso: number
}

export const downwardDog = definePose<DogCtx>({
  id: 'downward-dog',
  name: 'Downward Dog',
  category: 'Yoga',
  emoji: '🐕',
  summary: 'An inverted V: hips high, long spine, straight arms and legs, heels reaching down.',
  cameraTip: 'Put the camera at floor height to your side, so it sees you in profile from hands to heels.',
  cues: [
    'Arms straight, pressing the floor away',
    'One long line from wrists through shoulders to hips',
    'Hips lifted high and back',
    'Legs straight (bend a little if your hamstrings are tight)',
    'Heels reaching toward the floor',
    'Head relaxed between the arms',
  ],

  prepare(frame) {
    const s = SIDES[nearSide(frame)]
    if (!isVisible(frame, [s.shoulder, s.elbow, s.wrist, s.hip, s.knee, s.ankle])) {
      return { ready: false, hint: NOT_VISIBLE_HINT }
    }
    const img = frame.image
    const hipsHighest = img[s.hip]!.y < img[s.shoulder]!.y && img[s.hip]!.y < img[s.ankle]!.y
    const handsDown = img[s.wrist]!.y > img[s.shoulder]!.y
    if (!hipsHighest || !handsDown) {
      return { ready: false, hint: 'Hands and feet on the floor, then lift your hips up and back.' }
    }
    return { ready: true, ctx: { frame, img, world: frame.world, s, torso: dist2d(img[s.shoulder]!, img[s.hip]!) } }
  },

  checks: [
    {
      id: 'hip-angle',
      label: 'Hips high: an inverted V',
      evaluate({ img, s }): CheckResult {
        const hip = angle2d(img[s.shoulder]!, img[s.hip]!, img[s.ankle]!)
        const { status, direction } = grade(hip, { good: [50, 95], tolerance: 12 })
        return {
          status,
          detail: fmtDeg(hip),
          message:
            direction === 'high'
              ? 'Lift your hips higher and back. Walk your feet in a little if needed.'
              : 'Your stance is short: step your feet back a little.',
          joints: [s.shoulder, s.hip, s.ankle],
        }
      },
    },
    {
      id: 'arms-straight',
      label: 'Arms straight',
      evaluate({ world, s }): CheckResult {
        const elbow = angle3d(world[s.shoulder]!, world[s.elbow]!, world[s.wrist]!)
        const { status } = grade(elbow, { good: [163, 180], tolerance: 10 })
        return {
          status,
          detail: fmtDeg(elbow),
          message: 'Straighten your arms and press the floor away.',
          joints: [s.shoulder, s.elbow, s.wrist],
        }
      },
    },
    {
      id: 'long-spine',
      label: 'Long line from wrists to hips',
      evaluate({ img, s }): CheckResult {
        const line = angle2d(img[s.wrist]!, img[s.shoulder]!, img[s.hip]!)
        const { status } = grade(line, { good: [162, 180], tolerance: 14 })
        return {
          status,
          detail: fmtDeg(line),
          message: 'Press your chest back toward your thighs to lengthen your spine.',
          joints: [s.wrist, s.shoulder, s.hip],
        }
      },
    },
    {
      id: 'legs-straight',
      label: 'Legs straight',
      evaluate({ world, s }): CheckResult {
        const knee = angle3d(world[s.hip]!, world[s.knee]!, world[s.ankle]!)
        const { status } = grade(knee, { good: [163, 180], tolerance: 13 })
        return {
          status,
          detail: fmtDeg(knee),
          message: 'Straighten your legs by lifting your kneecaps, without forcing it.',
          joints: [s.hip, s.knee, s.ankle],
        }
      },
    },
    {
      id: 'heels-down',
      label: 'Heels reaching down',
      evaluate({ frame, img, s }): CheckResult {
        if (!isVisible(frame, [s.heel, s.foot])) return { status: 'unknown', detail: 'feet not visible' }
        const lift = angleFromHorizontal(img[s.heel]!, img[s.foot]!)
        const heelUp = img[s.heel]!.y < img[s.foot]!.y
        const value = heelUp ? lift : 0
        const { status } = grade(value, { good: [0, 28], tolerance: 15 })
        return {
          status,
          detail: fmtDeg(value),
          message: 'Sink your heels toward the floor.',
          joints: [s.heel, s.foot],
        }
      },
    },
    {
      id: 'head-relaxed',
      label: 'Head relaxed between the arms',
      evaluate({ frame, img, s, torso }): CheckResult {
        if (!isVisible(frame, [s.ear])) return { status: 'unknown', detail: 'head not visible' }
        // Positive = ear is above the shoulder, i.e. the head is lifted to look forward.
        const raised = (img[s.shoulder]!.y - img[s.ear]!.y) / torso
        const { status } = grade(raised, { good: [-1, 0.05], tolerance: 0.1 })
        return {
          status,
          detail: raised > 0 ? 'ear above shoulder' : 'ear below shoulder',
          message: 'Relax your neck and let your head hang between your arms.',
          joints: [s.ear, s.shoulder],
        }
      },
    },
  ],
})
