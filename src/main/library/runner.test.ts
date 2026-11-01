import { sep } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: {} }))

/** The game's folder in the host's separator: folderKey() appends path.sep (`\` on the Windows CI). */
const GAME_DIR = ['', 'games', 'x'].join(sep)

/** PowerShell stand-in: listing processes is slow, suspend/resume calls are recorded in order. */
const calls: string[] = []
vi.mock('child_process', () => ({
  execFile: (_cmd: string, args: string[], _opts: unknown, cb: (err: null, out: string) => void) => {
    const script = args[args.length - 1]
    if (script.includes('Win32_Process')) setTimeout(() => cb(null, `7|${GAME_DIR}${sep}x.exe\r\n`), 50)
    else {
      calls.push(script.includes('NtSuspendProcess') ? 'suspend' : 'resume')
      cb(null, '')
    }
  }
}))
const { nextWatch, suspendScript, Runner } = await import('./runner')

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

describe('suspendScript', () => {
  it('suspends or resumes exactly the given pids', () => {
    const s = suspendScript([12, 34.7], true)
    expect(s).toContain('NtSuspendProcess')
    expect(s).toContain('@(12,34)')
    expect(suspendScript([12], false)).toContain('NtResumeProcess')
  })
})

describe('Runner.setFrozen', () => {
  const platform = process.platform
  beforeEach(() => {
    calls.length = 0
    Object.defineProperty(process, 'platform', { value: 'win32' })
  })
  afterEach(() => Object.defineProperty(process, 'platform', { value: platform }))

  const runnerWithGame = () => {
    const runner = new Runner({ onStart: () => {}, onEnd: () => {} })
    const session = { watch: GAME_DIR, emulated: false, frozen: [], wantFrozen: false, freezing: Promise.resolve() }
    ;(runner as unknown as { games: Map<number, unknown> }).games.set(1, session)
    return runner
  }

  it('a quick unpause while the pause is still listing processes leaves the game running', async () => {
    const runner = runnerWithGame()
    const pause = runner.setFrozen(1, true)
    await Promise.all([pause, runner.setFrozen(1, false)])
    expect(calls).toEqual([])
  })

  it('pauses and unpauses in order', async () => {
    const runner = runnerWithGame()
    await runner.setFrozen(1, true)
    await runner.setFrozen(1, false)
    expect(calls).toEqual(['suspend', 'resume'])
  })
})
