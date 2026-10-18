import { SIDES, type PoseFrame, type Side, type SideIndices } from '@/pose/landmarks'

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
