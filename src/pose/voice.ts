/**
 * Speech output in English. Browsers default to the system language's voice, which
 * reads English text with a foreign accent (e.g. German), so we pick an English voice
 * explicitly and remember the user's choice.
 */

const STORAGE_KEY = 'dancetrainer.voice'

// Natural-sounding voices that ship with common browsers/OSes, best first.
const PREFERRED = [
  /Google US English/i,
  /Microsoft (Aria|Jenny|Ava|Emma|Andrew|Guy).*Natural/i,
  /^Samantha/i,
  /^Ava/i,
  /^Allison/i,
  /Google UK English Female/i,
  /Microsoft (Sonia|Libby).*Natural/i,
  /^Serena/i,
  /^Karen/i,
  /^Daniel/i,
  /Microsoft (Zira|David)/i,
]

// macOS novelty voices: technically English, but not what you want from a coach.
const NOVELTY =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical|Pipe Organ)\b/i

function rank(v: SpeechSynthesisVoice): number {
  const i = PREFERRED.findIndex((re) => re.test(v.name))
  if (i >= 0) return i
  const base = PREFERRED.length
  if (/^en[-_]US/i.test(v.lang)) return base + 1
  if (/^en[-_]GB/i.test(v.lang)) return base + 2
  return base + 3
}

const supported = () => typeof speechSynthesis !== 'undefined'

/** English voices on this device, best first. May be empty until voices load. */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!supported()) return []
  return speechSynthesis
    .getVoices()
    .filter((v) => /^en([-_]|$)/i.test(v.lang) && !NOVELTY.test(v.name))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** Calls `cb` now and whenever the browser's voice list changes. Returns an unsubscribe function. */
export function watchVoices(cb: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (!supported()) {
    cb([])
    return () => {}
  }
  const handler = () => cb(englishVoices())
  speechSynthesis.addEventListener('voiceschanged', handler)
  handler()
  return () => speechSynthesis.removeEventListener('voiceschanged', handler)
}

export function savedVoiceName(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveVoiceName(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // Private mode etc.: the choice just won't persist.
  }
}

function currentVoice(): SpeechSynthesisVoice | undefined {
  const voices = englishVoices()
  const saved = savedVoiceName()
  return voices.find((v) => v.name === saved) ?? voices[0]
}

export function speak(text: string) {
  if (!supported()) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = currentVoice()
  if (voice) u.voice = voice
  // Even without a matching voice object, asking for English avoids the system accent.
  u.lang = voice?.lang ?? 'en-US'
  u.rate = 1.05
  speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (supported()) speechSynthesis.cancel()
}
