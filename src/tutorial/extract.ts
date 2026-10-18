import { VideoAnalyser } from '@/pose/detector'
import { compactPoints, fillGaps, type PoseTrack } from './track'
import { YT_ENDED, type YouTubePlayer } from './player'

/** Samples per second of the teacher's pose. */
export const TRACK_FPS = 10

export class Cancelled extends Error {
  constructor() {
    super('Cancelled')
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', done)
      resolve()
    }
    // Some browsers occasionally never fire 'seeked'; don't hang forever.
    const timer = setTimeout(done, 2000)
    video.addEventListener('seeked', done)
    video.currentTime = t
  })
}

/** Analyses a local video frame by frame (by seeking), independent of playback speed. */
export async function analyseVideoFile(
  video: HTMLVideoElement,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<PoseTrack> {
  if (video.readyState < 1) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }))
  const duration = await knownDuration(video)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Couldn't read the length of this video.")
  const analyser = await VideoAnalyser.create()
  try {
    const n = Math.floor(duration * TRACK_FPS)
    const frames: PoseTrack['frames'] = []
    for (let i = 0; i < n; i++) {
      if (signal.aborted) throw new Cancelled()
      await seek(video, i / TRACK_FPS)
      const pose = analyser.detect(video, video.videoWidth / video.videoHeight)
      frames.push(pose ? compactPoints(pose.image) : null)
      onProgress((i + 1) / n)
    }
    return { fps: TRACK_FPS, duration, frames: fillGaps(frames) }
  } finally {
    analyser.close()
  }
}

/**
 * Recordings made in the browser (screen recorders, MediaRecorder) often report an
 * infinite duration until you seek past the end; do that once to learn the real length.
 */
async function knownDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration)) return video.duration
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('durationchange', check)
      resolve()
    }
    const check = () => Number.isFinite(video.duration) && done()
    const timer = setTimeout(done, 3000)
    video.addEventListener('durationchange', check)
    video.currentTime = 1e101
  })
  video.currentTime = 0
  return video.duration
}

export function thumbnail(source: HTMLVideoElement): string | undefined {
  try {
    const c = document.createElement('canvas')
    c.height = 120
    c.width = Math.round((120 * source.videoWidth) / source.videoHeight) || 160
    c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.7)
  } catch {
    return undefined
  }
}

/** Whether this browser can capture its own tab (desktop Chrome/Edge). */
export const canCaptureTab = () => typeof navigator.mediaDevices?.getDisplayMedia === 'function'

/**
 * Analyses an embedded YouTube video. Browsers don't let a page read pixels from a
 * YouTube iframe, so we ask the user to share this tab, play the video once at
 * normal speed and watch the captured picture of the player.
 */
export async function analyseYouTube(
  player: YouTubePlayer,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<{ track: PoseTrack; thumbnail?: string }> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: false,
    // Chrome: offer "this tab" first and allow it.
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions)
  const track = stream.getVideoTracks()[0]!
  const surface = (track.getSettings() as { displaySurface?: string }).displaySurface
  if (surface && surface !== 'browser') {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error('Please choose "This tab" when asked what to share, so the app can see the YouTube player.')
  }

  const iframe = player.iframe
  // Crop the capture to the player exactly, where the browser supports it.
  const CropTarget = (window as { CropTarget?: { fromElement(el: Element): Promise<unknown> } }).CropTarget
  let cropped = false
  if (CropTarget && 'cropTo' in track) {
    try {
      await (track as MediaStreamTrack & { cropTo(t: unknown): Promise<void> }).cropTo(await CropTarget.fromElement(iframe))
      cropped = true
    } catch {
      cropped = false
    }
  }

  const capture = document.createElement('video')
  capture.muted = true
  capture.playsInline = true
  capture.srcObject = stream
  await capture.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const analyser = await VideoAnalyser.create()
  const duration = player.duration()
  const n = Math.max(1, Math.floor(duration * TRACK_FPS))
  const frames: PoseTrack['frames'] = new Array(n).fill(null)
  let thumb: string | undefined

  try {
    player.setMuted(true)
    player.setRate(1)
    player.seek(0)
    await player.play()
    await new Promise<void>((resolve, reject) => {
      const step = () => {
        if (signal.aborted) return reject(new Cancelled())
        if (track.readyState === 'ended') return reject(new Error('Screen sharing was stopped before the video finished.'))
        if (player.state() === YT_ENDED) return resolve()
        if (capture.videoWidth) {
          const area = cropped ? null : playerArea(iframe, capture)
          const sx = area?.x ?? 0
          const sy = area?.y ?? 0
          const sw = area?.w ?? capture.videoWidth
          const sh = area?.h ?? capture.videoHeight
          if (canvas.width !== Math.round(sw) || canvas.height !== Math.round(sh)) {
            canvas.width = Math.round(sw)
            canvas.height = Math.round(sh)
          }
          ctx.drawImage(capture, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          const t = player.time()
          const i = Math.round(t * TRACK_FPS)
          if (i >= 0 && i < n && !frames[i]) {
            const pose = analyser.detect(canvas, canvas.width / canvas.height)
            frames[i] = pose ? compactPoints(pose.image) : null
            if (!thumb && t > duration * 0.25) thumb = canvas.toDataURL('image/jpeg', 0.7)
          }
          onProgress(Math.min(1, t / duration))
        }
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  } finally {
    player.pause()
    player.setMuted(false)
    analyser.close()
    stream.getTracks().forEach((t) => t.stop())
  }
  return { track: { fps: TRACK_FPS, duration, frames: fillGaps(frames, 5) }, thumbnail: thumb }
}

/** Where the player iframe sits inside a capture of the whole tab, in capture pixels. */
function playerArea(iframe: HTMLElement, capture: HTMLVideoElement) {
  const r = iframe.getBoundingClientRect()
  const scaleX = capture.videoWidth / window.innerWidth
  const scaleY = capture.videoHeight / window.innerHeight
  return { x: r.left * scaleX, y: r.top * scaleY, w: r.width * scaleX, h: r.height * scaleY }
}
