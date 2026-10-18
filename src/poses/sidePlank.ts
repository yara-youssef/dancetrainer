import { L, SIDES, type Point, type PoseFrame, type SideIndices } from '@/pose/landmarks'
import { angle2d, angleFromHorizontal, angleFromVertical, midpoint, offsetBelowLine } from '@/pose/geometry'
import { definePose, fmtDeg, grade, type CheckResult } from './types'
import { NOT_VISIBLE_HINT, isVisible, straightArm, straightLeg, jointAngle } from './common'

interface SidePlankCtx {
  frame: PoseFrame
  img: Point[]
  world: Point[]
  /** The supporting (bottom) side. */
  bottom: SideIndices
  top: SideIndices
  forearm: boolean
  shoulders: Point
  hips: Point
  ankles: Point
}

export const sidePlank = definePose<SidePlankCtx>({
  id: 'side-plank',
  name: 'Side Plank',
  category: 'Strength',
  emoji: '📐',
  summary: 'Balance on one hand (or forearm) and the side of your feet with your body lifted in one straight line.',
  cameraTip: 'Put the camera at floor height in front of you, so your chest faces it and your whole body is in view.',
  cues: [
    'Supporting hand (or elbow) directly under the shoulder',
    'Hips lifted: shoulders, hips and feet in one line',
    'Legs straight, feet stacked',
    'Head in line with the spine',
  ],

  prepare(frame) {
    const img = frame.image
    const bottom = img[L.LEFT_WRIST]!.y > img[L.RIGHT_WRIST]!.y ? SIDES.left : SIDES.right
    const top = bottom === SIDES.left ? SIDES.right : SIDES.left
    if (!isVisible(frame, [bottom.shoulder, bottom.elbow, bottom.wrist, bottom.hip, bottom.ankle, top.hip, top.ankle])) {
      return { ready: false, hint: NOT_VISIBLE_HINT }
    }
    const shoulders = midpoint(img[L.LEFT_SHOULDER]!, img[L.RIGHT_SHOULDER]!)
    const hips = midpoint(img[L.LEFT_HIP]!, img[L.RIGHT_HIP]!)
    const ankles = midpoint(img[L.LEFT_ANKLE]!, img[L.RIGHT_ANKLE]!)
    const lying = angleFromHorizontal(shoulders, ankles) < 50
    const supported = img[bottom.elbow]!.y > img[bottom.shoulder]!.y && img[bottom.wrist]!.y > img[bottom.shoulder]!.y
    if (!lying || !supported) {
      return { ready: false, hint: 'Get into a side plank: one hand under your shoulder, hips lifted in one line.' }
    }
    const w = frame.world
    const forearm = jointAngle(frame, bottom.shoulder, bottom.elbow, bottom.wrist) < 130
    return { ready: true, ctx: { frame, img, world: w, bottom, top, forearm, shoulders, hips, ankles } }
  },

  checks: [
    {
      id: 'hips-lifted',
      label: 'Hips lifted in one line',
      evaluate({ shoulders, hips, ankles }): CheckResult {
        const line = angle2d(shoulders, hips, ankles)
        const sagging = offsetBelowLine(hips, shoulders, ankles) > 0
        return {
          status: grade(line, { good: [166, 180], tolerance: 10 }).status,
          detail: `${fmtDeg(line)}, hips ${sagging ? 'low' : 'high'}`,
          message: sagging
            ? 'Lift your hips: press the floor away and make one straight line.'
            : 'Lower your hips slightly into one line with your shoulders and feet.',
          joints: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP, L.LEFT_ANKLE, L.RIGHT_ANKLE],
        }
      },
    },
    {
      id: 'stacked',
      label: 'Support under the shoulder',
      evaluate({ img, bottom, forearm }): CheckResult {
        const support = forearm ? bottom.elbow : bottom.wrist
        const lean = angleFromVertical(img[bottom.shoulder]!, img[support]!)
        return {
          status: grade(lean, { good: [0, 15], tolerance: 10 }).status,
          detail: fmtDeg(lean),
          message: `Place your ${forearm ? 'elbow' : 'hand'} directly under your shoulder.`,
          joints: [bottom.shoulder, support],
        }
      },
    },
    {
      id: 'arm',
      label: 'Supporting arm strong',
      evaluate: ({ frame, bottom, forearm }) =>
        forearm
          ? straightArm(frame, bottom, 'Keep your forearm flat with the elbow at a right angle.', {
              good: [70, 110],
              tolerance: 15,
            })
          : straightArm(frame, bottom, 'Straighten your supporting arm and push the floor away.', {
              good: [160, 180],
              tolerance: 10,
            }),
    },
    {
      id: 'legs-straight',
      label: 'Legs straight',
      evaluate({ frame, bottom, top }): CheckResult {
        const msg = 'Straighten your legs and reach through your heels.'
        const b = straightLeg(frame, bottom, msg)
        if (b.status !== 'good' || !isVisible(frame, [top.knee])) return b
        return straightLeg(frame, top, msg)
      },
    },
    {
      id: 'neck',
      label: 'Head in line with the spine',
      evaluate({ frame, img, shoulders, hips }): CheckResult {
        if (!isVisible(frame, [L.NOSE])) return { status: 'unknown', detail: 'head not visible' }
        const neck = angle2d(hips, shoulders, img[L.NOSE]!)
        return {
          status: grade(neck, { good: [150, 180], tolerance: 15 }).status,
          detail: fmtDeg(neck),
          message: 'Keep your head in line with your spine.',
          joints: [L.NOSE, L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
        }
      },
    },
  ],
})
