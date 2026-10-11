import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: {} }))
const { nextWatch } = await import('./runner')

const GRACE = 120_000
const start = { seen: false, misses: 0 }

describe('nextWatch', () => {
  it('waits through the grace period for the game to appear', () => {
    expect(nextWatch(start, false, 60_000, GRACE)).toEqual(start)
    expect(nextWatch(start, false, 121_000, GRACE)).toBe('ended')
  })

  it('ends soon after a game that ran closes, even inside the grace period', () => {
    const running = nextWatch(start, true, 20_000, GRACE)
    expect(running).toEqual({ seen: true, misses: 0 })
    const once = nextWatch(running as never, false, 30_000, GRACE)
    expect(once).toEqual({ seen: true, misses: 1 })
    expect(nextWatch(once as never, false, 35_000, GRACE)).toBe('ended')
  })

  it('a hand-off gap (launcher exits, game starts) does not end the session', () => {
    const gap = nextWatch({ seen: true, misses: 0 }, false, 30_000, GRACE)
    expect(nextWatch(gap as never, true, 35_000, GRACE)).toEqual({ seen: true, misses: 0 })
  })
})
