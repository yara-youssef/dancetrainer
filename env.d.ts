/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for the MediaPipe pose model (e.g. a self-hosted copy). */
  readonly VITE_POSE_MODEL_URL?: string
}
