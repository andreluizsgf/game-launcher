import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { systemRomsDir } from './romsDir'

describe('systemRomsDir', () => {
  const dirs: string[] = []
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'gl-roms-'))
    dirs.push(d)
    return d
  }
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

  it('reuses an existing folder under any accepted name', () => {
    const root = tmp()
    mkdirSync(join(root, 'PlayStation2'))
    mkdirSync(join(root, 'psx'))
    expect(systemRomsDir(root, 'ps2')).toBe(join(root, 'PlayStation2'))
  })

  it('falls back to the default name', () => {
    const root = tmp()
    expect(systemRomsDir(root, 'ps2')).toBe(join(root, 'ps2'))
    expect(systemRomsDir(join(root, 'missing'), 'ps2')).toBe(join(root, 'missing', 'ps2'))
  })

  it('needs a ROMs folder and a known system', () => {
    expect(systemRomsDir(null, 'ps2')).toBeNull()
    expect(systemRomsDir('/roms', 'nope')).toBeNull()
  })
})
