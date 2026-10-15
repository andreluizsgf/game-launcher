import { systemById } from '@shared/systems'
import type { Game } from '@shared/types'
import type { Shelf } from './shelves'

export type SortKey = 'title' | 'recent' | 'added' | 'release'

export interface GridFilter {
  sort: SortKey
  /** 'all', a source ('folder' | 'steam' | 'epic') or 'sys:<system id>' for emulated games. */
  origin: string
  /** 'all' or a genre name. */
  genre: string
}

export interface Option {
  value: string
  label: string
}

export const SORT_OPTIONS: Option[] = [
  { value: 'title', label: 'A–Z' },
  { value: 'recent', label: 'Jogados recentemente' },
  { value: 'added', label: 'Adicionados recentemente' },
  { value: 'release', label: 'Lançamento' }
]

/** What each shelf opens with: upcoming games by date, emulated ones by last played, the rest by name. */
export function defaultFilter(shelf: Shelf): GridFilter {
  const sort: SortKey = shelf === 'upcoming' ? 'release' : shelf === 'emulated' ? 'recent' : 'title'
  return { sort, origin: 'all', genre: 'all' }
}

const SOURCE_NAME: Record<Exclude<Game['source'], 'emulator'>, string> = {
  folder: 'Pasta de jogos',
  steam: 'Steam',
  epic: 'Epic Games'
}

export function originOf(g: Game): Option {
  if (g.source === 'emulator') return { value: `sys:${g.platform}`, label: systemById(g.platform)?.name ?? 'Emulador' }
  return { value: g.source, label: SOURCE_NAME[g.source] }
}

/** Origins and genres present on the shelf (genres by how common they are), each list led by "all". */
export function filterOptions(games: Game[]): { origins: Option[]; genres: Option[] } {
  const origins = new Map<string, Option>()
  const genres = new Map<string, number>()
  for (const g of games) {
    const o = originOf(g)
    origins.set(o.value, o)
    for (const genre of g.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1)
  }
  return {
    origins: [
      { value: 'all', label: 'Todas' },
      ...[...origins.values()].sort((a, b) => a.label.localeCompare(b.label))
    ],
    genres: [
      { value: 'all', label: 'Todos' },
      ...[...genres]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 16)
        .map(([genre]) => ({ value: genre, label: genre }))
    ]
  }
}

const byTitle = (a: Game, b: Game) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' })

export function applyFilter(games: Game[], f: GridFilter, shelf: Shelf): Game[] {
  const out = games.filter(
    (g) => (f.origin === 'all' || originOf(g).value === f.origin) && (f.genre === 'all' || g.genres.includes(f.genre))
  )
  const release = (g: Game) => g.releaseDate ?? (g.releaseYear ? Date.UTC(g.releaseYear, 0, 1) : null)
  switch (f.sort) {
    case 'title':
      return out.sort(byTitle)
    case 'recent':
      return out.sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) || byTitle(a, b))
    case 'added':
      return out.sort((a, b) => b.addedAt - a.addedAt || byTitle(a, b))
    case 'release':
      // Upcoming: soonest first. Everything else: newest first. Unknown dates last.
      return out.sort((a, b) => {
        const [ra, rb] = [release(a), release(b)]
        if (ra == null || rb == null) return ra == null && rb == null ? byTitle(a, b) : ra == null ? 1 : -1
        return shelf === 'upcoming' ? ra - rb : rb - ra
      })
  }
}

/** The option after `current` in `options` (wrapping). */
export function cycle(options: Option[], current: string): string {
  const i = options.findIndex((o) => o.value === current)
  return options[(i + 1) % options.length].value
}
