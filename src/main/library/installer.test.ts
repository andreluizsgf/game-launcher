import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { installerArgs } from './installer'

const dir = mkdtempSync(join(tmpdir(), 'gl-inst-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('installerArgs', () => {
  it('points Inno Setup installers at the target folder', async () => {
    const exe = join(dir, 'setup.exe')
    writeFileSync(exe, Buffer.concat([Buffer.alloc(100), Buffer.from('Inno Setup Setup Data (6.2.0)')]))
    expect(await installerArgs(exe, 'D:\\Games\\Hades\\Jogo')).toEqual(['/DIR="D:\\Games\\Hades\\Jogo"'])
  })

  it('passes nothing to installers it does not know', async () => {
    const exe = join(dir, 'other.exe')
    writeFileSync(exe, Buffer.alloc(100))
    expect(await installerArgs(exe, 'D:\\Games\\X\\Jogo')).toEqual([])
  })
})
