import { describe, expect, it } from 'vitest'
import type { DownloadInfo, Game } from '@shared/types'
import { activeDownloads, groupShelves, stepShelf } from './shelves'

const now = Date.UTC(2026, 9, 10)
const game = (id: number, extra: Partial<Game> = {}) =>
  ({ id, title: `G${id}`, folder: null, releaseDate: null, releaseYear: null, ...extra }) as Game
const dl = (gameId: number, state: DownloadInfo['state']) => ({ gameId, state }) as DownloadInfo

describe('groupShelves', () => {
  it('splits installed, downloading, library and upcoming', () => {
    const games = [
      game(1, { folder: '/g/1' }),
      game(2, { folder: '/g/2' }), // folder exists but still downloading
      game(3, { releaseDate: now - 1 }),
      game(4, { releaseDate: now + 86_400_000 * 30 }),
      game(5, { releaseYear: 2027 }),
      game(6)
    ]
    const s = groupShelves(games, activeDownloads([dl(2, 'downloading'), dl(1, 'done')]), now)
    expect(s.installed.map((g) => g.id)).toEqual([1])
    expect(s.downloading.map((g) => g.id)).toEqual([2])
    expect(s.library.map((g) => g.id)).toEqual([3, 6])
    expect(s.upcoming.map((g) => g.id)).toEqual([4, 5])
  })
})

describe('stepShelf', () => {
  it('skips empty shelves and stops at the ends', () => {
    const s = groupShelves([game(1, { folder: '/g' }), game(2, { releaseYear: 2030 })], new Map(), now)
    expect(stepShelf('installed', 1, s)).toBe('upcoming')
    expect(stepShelf('upcoming', 1, s)).toBe('upcoming')
    expect(stepShelf('upcoming', -1, s)).toBe('installed')
  })
})
