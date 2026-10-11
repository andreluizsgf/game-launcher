import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { titleFromFolder } from '../library/exePicker'
import type { ScannedGame } from '../library/scanner'
import { GamesRepo } from './games'
import { openDb } from './schema'

// better-sqlite3 is built for Electron's ABI: run with `npm run test:db` (vitest inside Electron-as-Node).
const repo = () => new GamesRepo(openDb(':memory:'))
const scanned = (name: string): ScannedGame => ({
  folder: join('/games', name),
  title: titleFromFolder(name), // what the scanner derives
  exePath: join('/games', name, 'game.exe'),
  coverPath: null
})
const meta = (title: string) => ({
  igdbId: 42,
  title,
  summary: null,
  releaseYear: 2020,
  releaseDate: null,
  genres: [],
  coverPath: null,
  artPath: null
})

describe('GamesRepo folder moves', () => {
  it('keeps the catalog link and playtime when a game folder is renamed', () => {
    const r = repo()
    r.sync([scanned('Hades')])
    const hades = r.list()[0]
    r.applyCatalog(hades.id, meta('Hades'))
    r.endSession(r.startSession(hades.id, 1000), hades.id, 61000, 60)

    r.sync([scanned('Hades v1.2')])
    const after = r.list()
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: hades.id, igdbId: 42, folder: join('/games', 'Hades v1.2'), totalSeconds: 60 })
  })

  it('repairs a duplicate left behind by older versions', () => {
    const r = repo()
    r.sync([scanned('Hades')])
    const old = r.list()[0]
    r.applyCatalog(old.id, meta('Hades'))
    // Old behavior: original hidden with its stale folder, new unlinked row for the new folder.
    r.sync([])
    const db = (r as unknown as { db: import('better-sqlite3').Database }).db
    db.prepare('INSERT INTO games (folder, title, exe_path, added_at) VALUES (?, ?, ?, ?)').run(
      join('/games', 'Jogos', 'Hades'),
      'Hades',
      'x.exe',
      Date.now()
    )

    r.sync([{ ...scanned('Hades'), folder: join('/games', 'Jogos', 'Hades') }])
    const after = r.list()
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: old.id, igdbId: 42, folder: join('/games', 'Jogos', 'Hades') })
  })

  it('absorb moves sessions and playtime into the kept game', () => {
    const r = repo()
    r.sync([scanned('A'), scanned('B')])
    const [a, b] = r.list()
    r.endSession(r.startSession(b.id, 1000), b.id, 31000, 30)
    r.sync([scanned('B')]) // A hidden
    r.absorb(a.id, b.id)
    expect(r.get(b.id)).toBeNull()
    expect(r.get(a.id)).toMatchObject({ folder: b.folder, totalSeconds: 30, hidden: false })
  })
})

describe('GamesRepo store games', () => {
  const steam = (id: string, title: string) => ({
    externalId: id,
    title,
    folder: join('/steam', title),
    exePath: null,
    launchUri: `steam://rungameid/${id}`
  })

  it('adds, keeps and hides store games without touching folder games', () => {
    const r = repo()
    r.sync([scanned('Hades')])
    expect(r.syncPlatform('steam', [steam('1', 'Portal'), steam('2', 'Celeste')])).toHaveLength(2)
    expect(r.syncPlatform('steam', [steam('1', 'Portal')])).toHaveLength(0)
    const visible = r.list().map((g) => `${g.source}:${g.title}`)
    expect(visible.sort()).toEqual(['folder:Hades', 'steam:Portal'])
    // A folder rescan doesn't hide store games.
    r.sync([scanned('Hades')])
    expect(r.list()).toHaveLength(2)
  })

  it('attaches to a wishlist entry with the same title', () => {
    const r = repo()
    const wish = r.addCatalog(meta('Portal'))
    r.syncPlatform('steam', [steam('400', 'Portal')])
    expect(r.list()).toHaveLength(1)
    expect(r.get(wish.id)).toMatchObject({ source: 'steam', externalId: '400', igdbId: 42 })
  })
})
