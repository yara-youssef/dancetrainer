import type { Feedback } from './engine'

/** Decides what (if anything) to say out loud, without nagging. */
export class VoiceCoach {
  private lastSpokenAt = -Infinity
  private lastText = ''
  private lastTextAt = -Infinity
  private issueSince = new Map<string, number>()
  private praisedHold = false
  private nextMilestone = 10

  constructor(
    /** Minimum gap between any two utterances. */
    private gapMs = 3500,
    /** Don't repeat the same sentence within this window. */
    private repeatMs = 8000,
    /** An issue must persist this long before it's spoken. */
    private settleMs = 900,
  ) {}

  next(fb: Feedback, now: number): string | null {
    if (now - this.lastSpokenAt < this.gapMs) return null

    if (fb.phase !== 'checking') {
      this.praisedHold = false
      this.nextMilestone = 10
      this.issueSince.clear()
      return fb.hint ? this.say(fb.hint, now, this.repeatMs * 1.5) : null
    }

    for (const c of fb.checks) {
      if (c.status === 'bad') this.issueSince.set(c.id, this.issueSince.get(c.id) ?? now)
      else this.issueSince.delete(c.id)
    }
    const issue = fb.checks.find(
      (c) => c.status === 'bad' && c.message && now - (this.issueSince.get(c.id) ?? now) >= this.settleMs,
    )
    if (issue?.message) {
      this.praisedHold = false
      this.nextMilestone = 10
      return this.say(issue.message, now)
    }

    if (fb.holdSeconds >= 1.5 && !this.praisedHold) {
      this.praisedHold = true
      return this.say(fb.topIssue ? 'Nice, hold it there.' : 'Beautiful! Hold it.', now, 0)
    }
    if (fb.holdSeconds >= this.nextMilestone) {
      const s = this.nextMilestone
      this.nextMilestone += 10
      return this.say(`${s} seconds.`, now, 0)
    }
    return null
  }

  private say(text: string, now: number, repeatMs = this.repeatMs): string | null {
    if (text === this.lastText && now - this.lastTextAt < repeatMs) return null
    this.lastText = text
    this.lastTextAt = now
    this.lastSpokenAt = now
    return text
  }
}

export function speak(text: string) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1.05
  speechSynthesis.speak(u)
}
