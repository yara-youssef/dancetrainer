import { describe, expect, it } from 'vitest'
import { POSES } from '..'
import { analyse, frameFrom, statuses } from './fixtures'

// The illustration is what we show as "correct", so it must pass its own checks.
describe('pose illustrations', () => {
  for (const pose of POSES) {
    it(`${pose.id} illustration has good form`, () => {
      const r = statuses(analyse(pose, frameFrom(pose.illustration.points)))
      expect(r).toBeTypeOf('object')
      expect(Object.entries(r).filter(([, s]) => s !== 'good')).toEqual([])
    })
  }
})
