import { afterEach, describe, expect, it, vi } from 'vitest'
import { englishVoices, speak } from '../voice'

const voice = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, default: isDefault, localService: true, voiceURI: name }) as SpeechSynthesisVoice

// A typical German Mac/Chrome: the system default voice is German.
const VOICES = [
  voice('Anna', 'de-DE', true),
  voice('Google Deutsch', 'de-DE'),
  voice('Bad News', 'en-US'),
  voice('Daniel', 'en-GB'),
  voice('Fred', 'en-US'),
  voice('Samantha', 'en-US'),
  voice('Google US English', 'en-US'),
]

function stubSpeech() {
  const spoken: SpeechSynthesisUtterance[] = []
  vi.stubGlobal('speechSynthesis', {
    getVoices: () => VOICES,
    speak: (u: SpeechSynthesisUtterance) => spoken.push(u),
    cancel: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      voice: SpeechSynthesisVoice | null = null
      lang = ''
      rate = 1
      constructor(public text: string) {}
    },
  )
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  return spoken
}

afterEach(() => vi.unstubAllGlobals())

describe('voice selection', () => {
  it('lists only English voices, best first, without novelty voices', () => {
    stubSpeech()
    expect(englishVoices().map((v) => v.name)).toEqual(['Google US English', 'Samantha', 'Daniel', 'Fred'])
  })

  it('speaks with an English voice even when the system default is German', () => {
    const spoken = stubSpeech()
    speak('Lift your knee higher.')
    expect(spoken[0]!.voice?.name).toBe('Google US English')
    expect(spoken[0]!.lang).toBe('en-US')
  })
})
