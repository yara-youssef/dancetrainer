import { describe, expect, it } from 'vitest'
import { POSES } from '..'
import { warrior2 } from '../warrior2'
import { analyse, statuses } from './fixtures'
// Landmarks MediaPipe produced for a photo of a well-executed Warrior II
// (storage.googleapis.com/mediapipe-assets/pose.jpg).
import warriorPhoto from './real/warrior2.json'

describe('real MediaPipe output: Warrior II photo', () => {
  it('scores the warrior as good form', () => {
    expect(statuses(analyse(warrior2, warriorPhoto))).toSatisfy(
      (r: ReturnType<typeof statuses>) => typeof r !== 'string' && Object.values(r).every((s) => s === 'good'),
    )
  })

  it('is not mistaken for any other position', () => {
    for (const pose of POSES.filter((p) => p !== warrior2)) {
      expect(typeof analyse(pose, warriorPhoto), pose.id).toBe('string')
    }
  })
})
