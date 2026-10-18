/** A common interface over a local video file and an embedded YouTube video. */
export interface TeacherPlayer {
  duration(): number
  /** Current position in seconds. */
  time(): number
  play(): Promise<void>
  pause(): void
  seek(t: number): void
  setRate(rate: number): void
  setMuted(muted: boolean): void
  /** Call from a click handler so later playback with sound is allowed on phones. */
  prime(): Promise<void>
  destroy(): void
}

export class FilePlayer implements TeacherPlayer {
  constructor(readonly el: HTMLVideoElement) {}

  duration = () => this.el.duration || 0
  time = () => this.el.currentTime
  play = () => this.el.play()
  pause = () => this.el.pause()
  seek = (t: number) => {
    this.el.currentTime = t
  }
  setRate = (rate: number) => {
    this.el.playbackRate = rate
  }
  setMuted = (muted: boolean) => {
    this.el.muted = muted
  }
  async prime() {
    const t = this.el.currentTime
    try {
      await this.el.play()
    } catch {
      // Ignore: we only need the gesture to register.
    }
    this.el.pause()
    this.el.currentTime = t
  }
  destroy() {
    this.el.pause()
  }
}

// --- YouTube -----------------------------------------------------------------

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setPlaybackRate(rate: number): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  mute(): void
  unMute(): void
  destroy(): void
  getIframe(): HTMLIFrameElement
  getVideoData?(): { title?: string }
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: Record<string, (e: { data: number; target: YTPlayer }) => void>
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

export const YT_ENDED = 0
export const YT_PLAYING = 1

let apiPromise: Promise<YTNamespace> | null = null

function loadYouTubeApi(): Promise<YTNamespace> {
  apiPromise ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT)
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!)
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.onerror = () => {
      apiPromise = null
      reject(new Error("Couldn't load YouTube. Check your internet connection."))
    }
    document.head.append(s)
  })
  return apiPromise
}

const YT_ERRORS: Record<number, string> = {
  2: "That doesn't look like a valid YouTube video.",
  5: "This video can't be played here.",
  100: 'This video was removed or is private.',
  101: "The video's owner doesn't allow it to be played on other sites. Screen-record it and upload the recording instead.",
  150: "The video's owner doesn't allow it to be played on other sites. Screen-record it and upload the recording instead.",
}

export class YouTubePlayer implements TeacherPlayer {
  private stateListeners = new Set<(state: number) => void>()

  private constructor(private yt: YTPlayer) {}

  /** Embeds a YouTube video into `el` (which gets replaced by the iframe). */
  static create(el: HTMLElement, videoId: string): Promise<YouTubePlayer> {
    return loadYouTubeApi().then(
      (YT) =>
        new Promise((resolve, reject) => {
          let wrapper: YouTubePlayer | null = null
          const yt = new YT.Player(el, {
            videoId,
            width: '100%',
            height: '100%',
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
            events: {
              onReady: () => {
                wrapper = new YouTubePlayer(yt)
                resolve(wrapper)
              },
              onStateChange: (e) => wrapper?.stateListeners.forEach((fn) => fn(e.data)),
              onError: (e) => reject(new Error(YT_ERRORS[e.data] ?? "This YouTube video can't be played here.")),
            },
          })
        }),
    )
  }

  get iframe(): HTMLIFrameElement {
    return this.yt.getIframe()
  }

  onState(fn: (state: number) => void): () => void {
    this.stateListeners.add(fn)
    return () => this.stateListeners.delete(fn)
  }

  title = () => this.yt.getVideoData?.().title ?? ''
  state = () => this.yt.getPlayerState()
  duration = () => this.yt.getDuration() || 0
  time = () => this.yt.getCurrentTime() || 0
  play = async () => this.yt.playVideo()
  pause = () => this.yt.pauseVideo()
  seek = (t: number) => this.yt.seekTo(t, true)
  setRate = (rate: number) => this.yt.setPlaybackRate(rate)
  setMuted = (muted: boolean) => (muted ? this.yt.mute() : this.yt.unMute())
  prime = async () => {}
  destroy = () => this.yt.destroy()
}
