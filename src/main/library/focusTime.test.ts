import { describe, expect, it } from 'vitest'
import { FocusClock } from './focusTime'

describe('FocusClock', () => {
  it('counts only the time the game was in front', () => {
    const c = new FocusClock(0)
    c.sample(1000, true)
    c.sample(2000, true)
    c.sample(3000, false) // PS menu / Alt+Tab
    c.sample(4000, false)
    c.sample(5000, true)
    expect(c.played(0, 5000)).toBe(3000)
  })

  it('does not count a suspended PC as playtime', () => {
    const c = new FocusClock(0)
    c.sample(1000, true)
    c.sample(8 * 3600_000, true) // first sample after a night asleep
    expect(c.played(0, 8 * 3600_000)).toBe(4000)
  })

  it('falls back to the session length when the sampler never reported', () => {
    expect(new FocusClock(0).played(0, 60_000)).toBe(60_000)
  })
})
