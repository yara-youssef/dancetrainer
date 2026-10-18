import { describe, expect, it } from 'vitest'
import { FeedbackEngine } from '../engine'
import { VoiceCoach } from '../coach'
import { definePose } from '@/poses/types'
import type { PoseFrame } from '../landmarks'

// A toy pose whose single check reads landmark 0's x coordinate: >= 0.5 is good.
const toy = definePose<PoseFrame>({
  id: 'toy',
  name: 'Toy',
  category: 'Strength',
  summary: '',
  cameraTip: '',
  cues: [],
  prepare: (frame) => ({ ready: true, ctx: frame }),
  checks: [
    {
      id: 'x',
      label: 'x high',
      evaluate: (f) => ({ status: f.image[0]!.x >= 0.5 ? 'good' : 'bad', message: 'Raise x.' }),
    },
  ],
})

const frame = (x: number): PoseFrame => ({ image: [{ x, y: 0, z: 0 }], world: [{ x, y: 0, z: 0 }] })

describe('FeedbackEngine', () => {
  it('debounces status changes', () => {
    const e = new FeedbackEngine(toy, { debounceMs: 300, smoothing: 1 })
    expect(e.update(frame(1), 0).checks[0]!.status).toBe('good')
    expect(e.update(frame(0), 100).checks[0]!.status).toBe('good')
    expect(e.update(frame(0), 450).checks[0]!.status).toBe('bad')
  })

  it('times how long the position is held', () => {
    const e = new FeedbackEngine(toy, { debounceMs: 0, smoothing: 1 })
    e.update(frame(1), 1000)
    expect(e.update(frame(1), 3500).holdSeconds).toBeCloseTo(2.5)
    const broken = e.update(frame(0), 4000)
    expect(broken.holdSeconds).toBe(0)
    expect(broken.bestHold).toBeCloseTo(2.5)
    expect(broken.topIssue?.message).toBe('Raise x.')
  })

  it('reports no person', () => {
    expect(new FeedbackEngine(toy).update(null, 0).phase).toBe('no-person')
  })
})

describe('VoiceCoach', () => {
  it('waits for an issue to settle, then does not nag', () => {
    const e = new FeedbackEngine(toy, { debounceMs: 0, smoothing: 1 })
    const c = new VoiceCoach(3000, 8000, 800)
    expect(c.next(e.update(frame(0), 0), 0)).toBeNull()
    expect(c.next(e.update(frame(0), 1000), 1000)).toBe('Raise x.')
    expect(c.next(e.update(frame(0), 5000), 5000)).toBeNull() // same line too soon
    expect(c.next(e.update(frame(0), 9500), 9500)).toBe('Raise x.')
  })

  it('praises a held position', () => {
    const e = new FeedbackEngine(toy, { debounceMs: 0, smoothing: 1 })
    const c = new VoiceCoach()
    c.next(e.update(frame(1), 0), 0)
    expect(c.next(e.update(frame(1), 2000), 2000)).toBe('Beautiful! Hold it.')
  })
})
