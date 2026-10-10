import type { DownloadInfo, Game } from '@shared/types'

export type Shelf = 'installed' | 'downloading' | 'library' | 'upcoming'

export const SHELF_ORDER: Shelf[] = ['installed', 'downloading', 'library', 'upcoming']

export const SHELF_LABEL: Record<Shelf, string> = {
  installed: 'Instalados',
  downloading: 'Baixando',
  library: 'Na biblioteca',
  upcoming: 'Aguardados'
}

/** Active (unfinished) downloads by library game id. */
export function activeDownloads(items: DownloadInfo[]): Map<number, DownloadInfo> {
  const out = new Map<number, DownloadInfo>()
  for (const d of items) if (d.gameId != null && d.state !== 'done') out.set(d.gameId, d)
  return out
}

export function isUpcoming(g: Game, now: number): boolean {
  if (g.releaseDate) return g.releaseDate > now
  return g.releaseYear != null && g.releaseYear > new Date(now).getFullYear()
}

/** A download in progress wins over "installed": its folder already exists but the game isn't complete. */
export function shelfOf(g: Game, downloads: Map<number, DownloadInfo>, now: number): Shelf {
  if (downloads.has(g.id)) return 'downloading'
  if (g.folder) return 'installed'
  return isUpcoming(g, now) ? 'upcoming' : 'library'
}

/** Keeps the incoming order (installed games are already sorted by last played). */
export function groupShelves(
  games: Game[],
  downloads: Map<number, DownloadInfo>,
  now = Date.now()
): Record<Shelf, Game[]> {
  const out: Record<Shelf, Game[]> = { installed: [], downloading: [], library: [], upcoming: [] }
  for (const g of games) out[shelfOf(g, downloads, now)].push(g)
  out.upcoming.sort((a, b) => (a.releaseDate ?? Infinity) - (b.releaseDate ?? Infinity))
  return out
}

/** Next non-empty shelf in `dir`, or the current one when there is none. */
export function stepShelf(current: Shelf, dir: -1 | 1, shelves: Record<Shelf, Game[]>): Shelf {
  const i = SHELF_ORDER.indexOf(current)
  for (let j = i + dir; j >= 0 && j < SHELF_ORDER.length; j += dir) {
    if (shelves[SHELF_ORDER[j]].length) return SHELF_ORDER[j]
  }
  return current
}
