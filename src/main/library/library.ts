import { shell } from 'electron'
import { mkdirSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import type { ScanResult } from '@shared/types'
import { titlesMatch } from '@shared/titleKey'
import { download } from '../catalog/art'
import type { GamesRepo } from '../db/games'
import { gameFolderOf } from '../downloads/match'
import type { QbWebApi } from '../downloads/qbWebApi'
import { scanEpic } from '../platforms/epic'
import { scanSteam, steamArt } from '../platforms/steam'
import { igdbCredentials, type StoredSettings } from '../settings'
import type { Catalog } from './catalog'
import type { Runner } from './runner'
import { scanRoot } from './scanner'

interface Deps {
  repo: GamesRepo
  runner: Runner
  settings: StoredSettings
  catalog: Catalog
  qbWeb: QbWebApi
  artDir: string
  /** Something on disk changed (e.g. a torrent was dropped): re-poll downloads. */
  onDownloadsChanged(): void
}

/** What's installed: the games folder plus the Steam/Epic libraries, and taking games off disk. */
export class Library {
  constructor(private d: Deps) {}

  async rescan(): Promise<ScanResult> {
    const { repo, settings } = this.d
    const result = settings.gamesRoot
      ? repo.sync(await scanRoot(settings.gamesRoot))
      : { added: 0, updated: 0, removed: 0, total: 0 }
    await this.syncPlatforms().catch((err) => console.warn('[platforms] sync failed', err))
    return result
  }

  /** Store libraries: installed Steam/Epic games, with artwork for the ones that just showed up. */
  private async syncPlatforms(): Promise<void> {
    const { repo, settings, catalog, artDir } = this.d
    const steam = settings.steamLibrary ? await scanSteam() : []
    for (const id of repo.syncPlatform('steam', steam)) {
      const g = repo.get(id)
      if (!g?.externalId) continue
      const art = steamArt(g.externalId)
      mkdirSync(artDir, { recursive: true })
      const [cover, wide] = await Promise.all([
        download(art.cover, join(artDir, `steam-${g.externalId}-cover.jpg`)),
        download(art.art, join(artDir, `steam-${g.externalId}-art.jpg`))
      ])
      repo.setArt(id, cover, wide)
    }
    // Epic has no public art CDN: link to the IGDB entry with the same title, when IGDB is set up.
    const epic = settings.epicLibrary ? scanEpic() : []
    for (const id of repo.syncPlatform('epic', epic)) {
      const g = repo.get(id)
      if (!g || !igdbCredentials(settings)) continue
      try {
        const hit = (await catalog.igdb.search(g.title)).find((h) => titlesMatch(h.name, g.title))
        if (hit && !repo.byIgdbId(hit.id)) repo.applyCatalog(id, await catalog.toMeta(hit))
      } catch {
        // Offline / IGDB down: it stays with its Epic name; "Identificar jogo" works later.
      }
    }
  }

  async launch(gameId: number): Promise<void> {
    const game = this.d.repo.get(gameId)
    if (!game) throw new Error('Jogo não encontrado')
    if (!game.folder) throw new Error('Jogo não instalado')
    await this.d.runner.launch(game)
  }

  async uninstall(gameId: number): Promise<void> {
    const { repo, runner, settings, qbWeb } = this.d
    const game = repo.get(gameId)
    const root = settings.gamesRoot
    if (!game?.folder) throw new Error('Jogo não instalado')
    if (runner.current() === gameId) throw new Error('Feche o jogo antes de desinstalar')
    // Store games: the store uninstalls (and the next rescan drops them).
    if (game.source === 'steam' && game.externalId) {
      await shell.openExternal(`steam://uninstall/${game.externalId}`)
      return
    }
    if (game.source !== 'folder') throw new Error('Desinstale pela Epic Games Launcher')
    // Only ever a direct subfolder of the games folder: never the root itself or anything outside it.
    const norm = (p: string) =>
      resolve(p)
        .replace(/[\\/]+$/, '')
        .toLowerCase()
    if (!root || norm(dirname(game.folder)) !== norm(root)) {
      throw new Error('Por segurança, só jogos dentro da pasta de jogos podem ser desinstalados pelo app')
    }
    try {
      // Drop its torrent first, or qBittorrent keeps it in error ("missing files").
      const hashes = (await qbWeb.torrents().catch(() => []))
        .filter((t) => gameFolderOf(t, root) === basename(game.folder!))
        .map((t) => t.hash)
      await qbWeb.remove(hashes, false).catch(() => {})
      await shell.trashItem(game.folder)
    } catch (err) {
      throw new Error(`Não deu pra mover a pasta pra Lixeira: ${err instanceof Error ? err.message : String(err)}`)
    }
    repo.uninstall(gameId)
    this.d.onDownloadsChanged()
  }

  remove(gameId: number): void {
    if (!this.d.repo.removeCatalog(gameId)) throw new Error('Só jogos não instalados podem ser removidos')
  }
}
