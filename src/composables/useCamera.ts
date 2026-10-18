import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export type Facing = 'user' | 'environment'

/** The selfie/back camera feeding a <video> element, with mirroring and keep-awake. */
export function useCamera(video: Ref<HTMLVideoElement | undefined>) {
  const active = ref(false)
  const facing = ref<Facing>('user')
  /** Show the picture mirrored, like a mirror (natural for the selfie camera). */
  const mirror = ref(true)
  let stream: MediaStream | null = null
  let wakeLock: WakeLockSentinel | null = null

  async function start() {
    stop()
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing.value }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    active.value = true
    await new Promise((r) => requestAnimationFrame(r)) // let the <video> render
    const v = video.value
    if (!v) throw new Error('Camera view is not ready.')
    v.srcObject = stream
    await v.play()
    keepAwake()
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    if (video.value) video.value.srcObject = null
    wakeLock?.release().catch(() => {})
    wakeLock = null
    active.value = false
  }

  async function switchCamera() {
    facing.value = facing.value === 'user' ? 'environment' : 'user'
    // The selfie camera feels natural mirrored; the back camera should not be.
    mirror.value = facing.value === 'user'
    await start()
  }

  /** Stop the phone screen from dimming mid-practice. */
  async function keepAwake() {
    try {
      wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      wakeLock = null // Not supported or denied: not essential.
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && active.value) keepAwake()
  }
  onMounted(() => document.addEventListener('visibilitychange', onVisibility))
  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  return { active, facing, mirror, start, stop, switchCamera }
}

export function describeCameraError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in your browser and try again.'
  if (name === 'NotFoundError') return 'No camera was found on this device.'
  if (name === 'NotReadableError') return 'The camera is in use by another app.'
  if (name === 'NotSupportedError') return "This video format can't be played in your browser."
  if (!window.isSecureContext) return 'The camera only works over HTTPS (or on localhost).'
  return `Something went wrong: ${(e as Error)?.message ?? e}`
}
