import { PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import type { PoseFrame } from './landmarks'

const MODEL_URL =
  import.meta.env.VITE_POSE_MODEL_URL ||
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

type Mode = 'VIDEO' | 'IMAGE'

let landmarker: Promise<PoseLandmarker> | null = null
let mode: Mode = 'VIDEO'

async function create(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(
    { wasmLoaderPath, wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    },
  )
}

/** Loads the pose model once; later calls reuse it. Falls back to CPU if WebGL fails. */
export function loadDetector(): Promise<PoseLandmarker> {
  if (!landmarker) {
    landmarker = create('GPU').catch(() => create('CPU'))
    // Allow a retry (e.g. after a network error) on the next call.
    landmarker.catch(() => (landmarker = null))
  }
  return landmarker
}

async function useMode(lm: PoseLandmarker, next: Mode) {
  if (mode !== next) {
    await lm.setOptions({ runningMode: next })
    mode = next
  }
}

export async function detectVideo(video: HTMLVideoElement, timestamp: number): Promise<PoseFrame | null> {
  const lm = await loadDetector()
  await useMode(lm, 'VIDEO')
  return toFrame(lm.detectForVideo(video, timestamp), video.videoWidth / video.videoHeight)
}

export async function detectImage(image: HTMLImageElement): Promise<PoseFrame | null> {
  const lm = await loadDetector()
  await useMode(lm, 'IMAGE')
  return toFrame(lm.detect(image), image.naturalWidth / image.naturalHeight)
}

function toFrame(result: PoseLandmarkerResult, aspect: number): PoseFrame | null {
  const image = result.landmarks[0]
  const world = result.worldLandmarks[0]
  if (!image || !world) return null
  return {
    image: image.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z * aspect, visibility: p.visibility })),
    world: world.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })),
  }
}
