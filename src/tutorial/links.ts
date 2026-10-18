/** Recognises tutorial links and explains what can be done with each platform. */

export type LinkInfo =
  | { platform: 'youtube'; videoId: string }
  | { platform: 'tiktok' | 'instagram' | 'other'; url: string }
  | { platform: 'invalid' }

export function parseLink(input: string): LinkInfo {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { platform: 'invalid' }
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '')
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    return id ? { platform: 'youtube', videoId: id } : { platform: 'invalid' }
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v')
    if (v) return { platform: 'youtube', videoId: v }
    const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]+)/)
    return m ? { platform: 'youtube', videoId: m[1]! } : { platform: 'invalid' }
  }
  if (host.endsWith('tiktok.com')) return { platform: 'tiktok', url: url.href }
  if (host === 'instagram.com' || host === 'instagr.am') return { platform: 'instagram', url: url.href }
  return { platform: 'other', url: url.href }
}

/** Why a link can't be used directly, and what to do instead. */
export const SAVE_INSTRUCTIONS: Record<'tiktok' | 'instagram' | 'other', string[]> = {
  tiktok: [
    "TikTok doesn't let other websites read its videos, so save it to your phone first:",
    'In TikTok, tap Share → Save video. (If saving is turned off, use your phone’s screen recording while it plays.)',
    'Then come back here and choose Upload a video.',
  ],
  instagram: [
    "Instagram doesn't let other websites read its videos, so get a copy on your phone first:",
    'Start your phone’s screen recording, play the reel, then stop recording. Trim the recording to the dance if you like.',
    'Then come back here and choose Upload a video.',
  ],
  other: [
    "Videos on other websites usually can't be read directly by this app.",
    'Download the video or screen-record it while it plays, then choose Upload a video.',
  ],
}
