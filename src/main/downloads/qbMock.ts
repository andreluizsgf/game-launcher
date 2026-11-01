import { join } from 'path'
import type { QbTorrent, QbWebApi } from './qbWebApi'

const GB = 1024 ** 3

/**
 * Dev-only fake qBittorrent (`GL_DOWNLOADS_MOCK=1`) to work on the Downloads UI without one running.
 * Torrents save straight into the games folder and advance a little on every poll; pause/remove work.
 */
export function mockQbWebApi(gamesRoot: () => string | null): QbWebApi {
  const seed: [string, string, number, number][] = [
    ['Elden Ring', 'downloading', 0.42, 48],
    ['Hollow Knight Silksong', 'stalledDL', 0.08, 7],
    ['Cyberpunk 2077', 'stoppedDL', 0.67, 70],
    ['Hades II', 'queuedDL', 0, 12],
    ['Celeste', 'stalledUP', 1, 1.2]
  ]
  const list = seed.map(([name, state, progress, gb], i) => ({
    hash: `mock${i}`,
    name,
    state,
    progress,
    size: gb * GB
  }))

  const torrents = async (): Promise<QbTorrent[]> => {
    const root = gamesRoot() ?? '/games'
    for (const t of list) {
      if (t.state !== 'downloading') continue
      t.progress = Math.min(1, t.progress + 0.004)
      if (t.progress >= 1) t.state = 'stalledUP'
    }
    return list.map((t) => ({
      ...t,
      dlspeed: t.state === 'downloading' ? 23 * 1024 ** 2 : 0,
      eta: t.state === 'downloading' ? Math.round(((1 - t.progress) * t.size) / (23 * 1024 ** 2)) : 8640000,
      save_path: root,
      content_path: join(root, t.name)
    }))
  }
  const api = {
    torrents,
    async setPaused(hashes: string[], paused: boolean) {
      for (const t of list) if (hashes.includes(t.hash)) t.state = paused ? 'stoppedDL' : 'downloading'
    },
    async remove(hashes: string[]) {
      for (const h of hashes) list.splice(list.findIndex((t) => t.hash === h), 1)
    },
    async add() {}
  }
  return api as unknown as QbWebApi
}
