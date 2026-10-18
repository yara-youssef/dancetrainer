/** A single body landmark. For image landmarks x/y are scaled so that y spans 0..1
 *  and x spans 0..aspect (keeps both axes in the same unit). y points DOWN. */
export interface Point {
  x: number
  y: number
  z: number
  visibility?: number
}

/** One analysed frame: 33 MediaPipe pose landmarks in two coordinate systems. */
export interface PoseFrame {
  /** Image-space landmarks (aspect-corrected, y down). Use for gravity-relative checks. */
  image: Point[]
  /** Metric 3D landmarks centred on the hips (y down). Use for joint angles. */
  world: Point[]
}

/** MediaPipe BlazePose landmark indices. "LEFT" is the person's own left. */
export const L = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const

export const LANDMARK_COUNT = 33

export type Side = 'left' | 'right'

/** Landmark indices for one side of the body. */
export interface SideIndices {
  ear: number
  shoulder: number
  elbow: number
  wrist: number
  index: number
  hip: number
  knee: number
  ankle: number
  heel: number
  foot: number
}

export const SIDES: Record<Side, SideIndices> = {
  left: {
    ear: L.LEFT_EAR,
    shoulder: L.LEFT_SHOULDER,
    elbow: L.LEFT_ELBOW,
    wrist: L.LEFT_WRIST,
    index: L.LEFT_INDEX,
    hip: L.LEFT_HIP,
    knee: L.LEFT_KNEE,
    ankle: L.LEFT_ANKLE,
    heel: L.LEFT_HEEL,
    foot: L.LEFT_FOOT_INDEX,
  },
  right: {
    ear: L.RIGHT_EAR,
    shoulder: L.RIGHT_SHOULDER,
    elbow: L.RIGHT_ELBOW,
    wrist: L.RIGHT_WRIST,
    index: L.RIGHT_INDEX,
    hip: L.RIGHT_HIP,
    knee: L.RIGHT_KNEE,
    ankle: L.RIGHT_ANKLE,
    heel: L.RIGHT_HEEL,
    foot: L.RIGHT_FOOT_INDEX,
  },
}

export const otherSide = (side: Side): Side => (side === 'left' ? 'right' : 'left')

/** Skeleton edges used for drawing. */
export const CONNECTIONS: [number, number][] = [
  [L.LEFT_SHOULDER, L.RIGHT_SHOULDER],
  [L.LEFT_SHOULDER, L.LEFT_ELBOW],
  [L.LEFT_ELBOW, L.LEFT_WRIST],
  [L.LEFT_WRIST, L.LEFT_INDEX],
  [L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
  [L.RIGHT_ELBOW, L.RIGHT_WRIST],
  [L.RIGHT_WRIST, L.RIGHT_INDEX],
  [L.LEFT_SHOULDER, L.LEFT_HIP],
  [L.RIGHT_SHOULDER, L.RIGHT_HIP],
  [L.LEFT_HIP, L.RIGHT_HIP],
  [L.LEFT_HIP, L.LEFT_KNEE],
  [L.LEFT_KNEE, L.LEFT_ANKLE],
  [L.LEFT_ANKLE, L.LEFT_HEEL],
  [L.LEFT_HEEL, L.LEFT_FOOT_INDEX],
  [L.LEFT_ANKLE, L.LEFT_FOOT_INDEX],
  [L.RIGHT_HIP, L.RIGHT_KNEE],
  [L.RIGHT_KNEE, L.RIGHT_ANKLE],
  [L.RIGHT_ANKLE, L.RIGHT_HEEL],
  [L.RIGHT_HEEL, L.RIGHT_FOOT_INDEX],
  [L.RIGHT_ANKLE, L.RIGHT_FOOT_INDEX],
  [L.LEFT_EAR, L.NOSE],
  [L.RIGHT_EAR, L.NOSE],
]
