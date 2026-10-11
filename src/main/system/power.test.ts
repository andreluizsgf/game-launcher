import { describe, expect, it } from 'vitest'
import { powerCommand } from './power'

describe('powerCommand', () => {
  it('maps actions to Windows commands', () => {
    expect(powerCommand('shutdown')).toEqual(['shutdown', ['/s', '/t', '0']])
    expect(powerCommand('restart')).toEqual(['shutdown', ['/r', '/t', '0']])
    const [cmd, args] = powerCommand('sleep')
    expect(cmd).toBe('powershell.exe')
    // Real sleep, not rundll32 (which hibernates when hibernation is on).
    expect(args.join(' ')).toContain("SetSuspendState('Suspend'")
  })
})
