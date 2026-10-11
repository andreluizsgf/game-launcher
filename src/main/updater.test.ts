import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getVersion: () => '0.3.5' } }))
vi.mock('electron-updater', () => ({ autoUpdater: {} }))

const { isNewer } = await import('./updater')

describe('isNewer', () => {
  it('compares x.y.z numerically, with or without v', () => {
    expect(isNewer('v0.3.10', '0.3.9')).toBe(true)
    expect(isNewer('0.4.0', '0.3.9')).toBe(true)
    expect(isNewer('v0.3.5', '0.3.5')).toBe(false)
    expect(isNewer('0.3.4', '0.3.5')).toBe(false)
  })
})
