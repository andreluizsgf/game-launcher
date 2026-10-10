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
file('Deep/a/b/c/d/too-deep.exe') // depth 4 under game folder → ignored
file('Deep/a/shallow.exe')
mkdirSync(join(root, 'Empty'))
mkdirSync(join(root, '.hidden'))

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('scanRoot', () => {
  it('lists one game per subfolder', async () => {
    const games = await scanRoot(root)
    const byTitle = Object.fromEntries(games.map((g) => [g.title, g]))
    expect(Object.keys(byTitle).sort()).toEqual(['Deep', 'Empty', 'Hades'])
    expect(byTitle.Hades.exePath).toBe(join(root, 'Hades', 'Hades.exe'))
    expect(byTitle.Hades.coverPath).toBe(join(root, 'Hades', 'cover.jpg'))
    expect(byTitle.Deep.exePath).toBe(join(root, 'Deep', 'a', 'shallow.exe'))
    expect(byTitle.Empty.exePath).toBeNull()
  })
})
