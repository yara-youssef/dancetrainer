import type { Feedback } from './engine'

export type Tone = 'info' | 'good' | 'warn' | 'bad'

/** The single headline message for the current feedback. */
export function headline(fb: Feedback | null, live: boolean): { tone: Tone; text: string } {
  if (!fb) return { tone: 'info', text: 'Waiting for the camera…' }
  if (fb.phase !== 'checking') return { tone: 'info', text: fb.hint ?? '' }
  if (fb.topIssue?.status === 'bad') return { tone: 'bad', text: fb.topIssue.message ?? fb.topIssue.label }
  if (fb.topIssue) return { tone: 'warn', text: `Almost! ${fb.topIssue.message ?? ''}` }
  return { tone: 'good', text: live ? 'Looking great. Hold it!' : 'Looking great!' }
}
