import { describe, expect, it } from 'vitest'
import type { Game } from '@shared/types'
import { applyFilter, cycle, defaultFilter, filterOptions, SORT_OPTIONS } from './gridFilter'

const game = (id: number, title: string, extra: Partial<Game> = {}): Game => ({
  id,
  folder: null,
  title,
  exePath: null,
  exeOverride: null,
  coverPath: null,
  artPath: null,
  igdbId: null,
  summary: null,
  releaseYear: null,
  releaseDate: null,
  genres: [],
  addedAt: id,
  lastPlayedAt: null,
  totalSeconds: 0,
  hidden: false,
  inputMode: 'auto',
  source: 'folder',
  externalId: null,
  launchUri: null,
  installerPath: null,
  platform: null,
  ...extra
})

const games = [
  game(1, 'Zelda', { source: 'emulator', platform: 'snes', genres: ['Adventure'], lastPlayedAt: 10 }),
  game(2, 'Okami', { source: 'emulator', platform: 'ps2', genres: ['Adventure', 'RPG'], releaseYear: 2006 }),
  game(3, 'ágata', { source: 'steam', genres: ['RPG'], releaseDate: Date.UTC(2020, 0, 1), lastPlayedAt: 50 }),
  game(4, 'Celeste', { source: 'epic' })
]

describe('grid filters', () => {
  it('lists the origins and genres present', () => {
    const { origins, genres } = filterOptions(games)
    expect(origins.map((o) => o.label)).toEqual(['Todas', 'Epic Games', 'PlayStation 2', 'Steam', 'Super Nintendo'])
    expect(genres.map((g) => g.value)).toEqual(['all', 'Adventure', 'RPG'])
  })

  it('filters by origin and genre', () => {
    const f = { ...defaultFilter('library'), origin: 'sys:ps2' }
    expect(applyFilter(games, f, 'library').map((g) => g.id)).toEqual([2])
    expect(applyFilter(games, { ...f, origin: 'all', genre: 'RPG' }, 'library').map((g) => g.id)).toEqual([3, 2])
  })

  it('sorts by name (accent-insensitive), last played, added and release', () => {
    const ids = (sort: 'title' | 'recent' | 'added' | 'release', shelf: 'library' | 'upcoming' = 'library') =>
      applyFilter(games, { sort, origin: 'all', genre: 'all' }, shelf).map((g) => g.id)
    expect(ids('title')).toEqual([3, 4, 2, 1])
    expect(ids('recent')).toEqual([3, 1, 4, 2])
    expect(ids('added')).toEqual([4, 3, 2, 1])
    expect(ids('release')).toEqual([3, 2, 4, 1])
    expect(ids('release', 'upcoming')).toEqual([2, 3, 4, 1])
  })

  it('cycles options and picks per-shelf defaults', () => {
    expect(cycle(SORT_OPTIONS, 'release')).toBe('title')
    expect(defaultFilter('upcoming').sort).toBe('release')
    expect(defaultFilter('emulated').sort).toBe('recent')
  })
})
