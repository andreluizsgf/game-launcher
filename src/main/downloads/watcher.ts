import type { DownloadInfo, DownloadsStatus, Game } from '@shared/types'
import { downloadState, gameFolderOf, matchGame } from './match'
import type { QbWebApi } from './qbWebApi'

const POLL_MS = 2000
/** Web UI off or qBittorrent closed: check back less often. */
const OFFLINE_POLL_MS = 15000
const ETA_INFINITE = 8640000

interface Deps {
  api: QbWebApi
  gamesRoot(): string | null
  games(): Game[]
  emit(status: DownloadsStatus): void
  /** A torrent in the games folder finished: time to rescan. */
  onCompleted(item: DownloadInfo): void
}

/** Polls qBittorrent and reports the torrents that download into the games folder. */
export class DownloadWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastState = new Map<string, DownloadInfo['state']>()
  private last: DownloadsStatus = { available: false, items: [] }

  constructor(private deps: Deps) {}

  start(): void {
    if (!this.timer) this.tick()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** Poll right away (e.g. just after adding a torrent). */
  poke(): void {
    this.stop()
    this.tick()
  }

  current(): DownloadsStatus {
    return this.last
  }

  private async tick(): Promise<void> {
    let next = POLL_MS
    const root = this.deps.gamesRoot()
    try {
      const items = root ? this.toItems(await this.deps.api.torrents(), root) : []
      for (const it of items) {
        const prev = this.lastState.get(it.hash)
        if (prev && prev !== 'done' && it.state === 'done') this.deps.onCompleted(it)
        this.lastState.set(it.hash, it.state)
      }
      this.publish({ available: !!root, items })
    } catch {
      next = OFFLINE_POLL_MS
      this.publish({ available: false, items: [] })
    }
    this.timer = setTimeout(() => this.tick(), next)
  }

  private toItems(torrents: Awaited<ReturnType<QbWebApi['torrents']>>, root: string): DownloadInfo[] {
    const games = this.deps.games()
    const out: DownloadInfo[] = []
    for (const t of torrents) {
      const folder = gameFolderOf(t, root)
      if (!folder) continue
      const game = matchGame(folder, root, games)
      out.push({
        hash: t.hash,
        gameId: game?.id ?? null,
        title: game?.title ?? folder,
        progress: t.progress,
        state: downloadState(t.state),
        speed: t.dlspeed,
        eta: t.eta > 0 && t.eta < ETA_INFINITE ? t.eta : null,
        size: t.size
      })
    }
    return out
  }

  private publish(status: DownloadsStatus): void {
    const key = JSON.stringify(status)
    if (key === JSON.stringify(this.last)) return
    this.last = status
    this.deps.emit(status)
  }
}
