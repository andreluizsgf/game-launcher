import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { scanRoot } from './scanner'

const root = mkdtempSync(join(tmpdir(), 'gl-scan-'))
const file = (p: string, size = 10) => {
  mkdirSync(join(root, p, '..'), { recursive: true })
  writeFileSync(join(root, p), Buffer.alloc(size))
}

file('Hades/Hades.exe', 100)
file('Hades/unins000.exe', 500)
file('Hades/cover.jpg')
file('Deep/a/b/c/d/e/too-deep.exe') // depth 5 under game folder → ignored
file('Deep/a/shallow.exe')
file('Repack/Repack [FitGirl]/setup.exe', 50)
file('Repack/Repack [FitGirl]/fg-01.bin', 500)
file('Repack/Repack [FitGirl]/MD5/QuickSFV.EXE', 20)
mkdirSync(join(root, 'Empty'))
mkdirSync(join(root, '.hidden'))

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('scanRoot', () => {
  it('lists one game per subfolder', async () => {
    const games = await scanRoot(root)
    const byTitle = Object.fromEntries(games.map((g) => [g.title, g]))
    expect(Object.keys(byTitle).sort()).toEqual(['Deep', 'Empty', 'Hades', 'Repack'])
    expect(byTitle.Hades.exePath).toBe(join(root, 'Hades', 'Hades.exe'))
    expect(byTitle.Hades.coverPath).toBe(join(root, 'Hades', 'cover.jpg'))
    expect(byTitle.Deep.exePath).toBe(join(root, 'Deep', 'a', 'shallow.exe'))
    expect(byTitle.Empty.exePath).toBeNull()
    expect(byTitle.Hades.installerPath).toBeNull()
  })

  it('flags repacks that still have to be installed', async () => {
    const repack = (await scanRoot(root)).find((g) => g.title === 'Repack')!
    expect(repack.exePath).toBeNull()
    expect(repack.installerPath).toBe(join(root, 'Repack', 'Repack [FitGirl]', 'setup.exe'))
  })
})
