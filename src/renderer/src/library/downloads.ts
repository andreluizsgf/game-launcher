import type { DownloadInfo } from '@shared/types'

/** Still needs attention: everything but finished (seeding) torrents. */
export const isActive = (d: DownloadInfo): boolean => d.state !== 'done'

/** Count and overall progress (by size, so a 100 GB game weighs more than a patch) of unfinished downloads. */
export function downloadsSummary(items: DownloadInfo[]): { active: number; progress: number } {
  const active = items.filter(isActive)
  const size = active.reduce((n, d) => n + d.size, 0)
  const done = active.reduce((n, d) => n + d.size * d.progress, 0)
  if (size > 0) return { active: active.length, progress: done / size }
  // Sizes still unknown (a magnet fetching its metadata): plain average.
  const progress = active.length ? active.reduce((n, d) => n + d.progress, 0) / active.length : 0
  return { active: active.length, progress }
}

const RANK: Record<DownloadInfo['state'], number> = {
  downloading: 0,
  stalled: 1,
  error: 2,
  queued: 3,
  paused: 4,
  done: 5
}

/** Screen order: what's moving first, finished ones last; title breaks ties so rows don't jump around. */
export function sortDownloads(items: DownloadInfo[]): DownloadInfo[] {
  return [...items].sort((a, b) => RANK[a.state] - RANK[b.state] || a.title.localeCompare(b.title, 'pt-BR'))
}
