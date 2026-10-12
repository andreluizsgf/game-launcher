import { shell } from 'electron'
import { mkdirSync, promises as fs } from 'fs'
import { basename, dirname, join, resolve, sep } from 'path'
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
import { INSTALL_DIR, runInstaller } from './installer'
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
    const { repo, runner, settings } = this.d
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
    if (!root || !isDirectChild(game.folder, root)) {
      throw new Error('Por segurança, só jogos dentro da pasta de jogos podem ser desinstalados pelo app')
    }
    try {
      await this.dropTorrents(game.folder)
      await shell.trashItem(game.folder)
    } catch (err) {
      throw new Error(`Não deu pra mover a pasta pra Lixeira: ${err instanceof Error ? err.message : String(err)}`)
    }
    repo.uninstall(gameId)
    this.d.onDownloadsChanged()
  }

  /** Drops the folder's torrents, or qBittorrent keeps them in error ("missing files"). */
  private async dropTorrents(folder: string): Promise<void> {
    const { settings, qbWeb } = this.d
    const root = settings.gamesRoot
    if (!root) return
    const hashes = (await qbWeb.torrents().catch(() => []))
      .filter((t) => gameFolderOf(t, root) === basename(folder))
      .map((t) => t.hash)
    await qbWeb.remove(hashes, false).catch(() => {})
  }

  private installable(gameId: number): { folder: string; installer: string } {
    const game = this.d.repo.get(gameId)
    const root = this.d.settings.gamesRoot
    if (!game?.folder || !game.installerPath) throw new Error('Nenhum instalador encontrado')
    if (!root || !isDirectChild(game.folder, root)) throw new Error('O jogo precisa estar na pasta de jogos')
    return { folder: game.folder, installer: game.installerPath }
  }

  /** Runs the repack's setup into <game folder>/Jogo, then rescans so the installed exe shows up. */
  async install(gameId: number): Promise<void> {
    const { folder, installer } = this.installable(gameId)
    if (this.installing.has(gameId)) throw new Error('A instalação já está aberta')
    this.installing.add(gameId)
    try {
      await runInstaller(installer, join(folder, INSTALL_DIR))
    } finally {
      this.installing.delete(gameId)
    }
    await this.rescan()
    if (!this.d.repo.get(gameId)?.exePath) {
      throw new Error(`Não achei o jogo instalado. Instale dentro de ${join(folder, INSTALL_DIR)}`)
    }
  }

  private installing = new Set<number>()

  /**
   * After installing: the repack files (setup, .bin archives…) go to the Recycle Bin and its torrent leaves
   * qBittorrent; only the Jogo subfolder stays.
   */
  async cleanInstaller(gameId: number): Promise<void> {
    const { folder } = this.installable(gameId)
    const game = this.d.repo.get(gameId)!
    const installed = join(folder, INSTALL_DIR)
    if (!game.exePath || !isInside(game.exePath, installed)) {
      throw new Error(`O jogo não está instalado em ${installed}; apague o instalador manualmente`)
    }
    if (this.d.runner.current() === gameId) throw new Error('Feche o jogo antes')
    await this.dropTorrents(folder)
    const entries = await fs.readdir(folder)
    for (const name of entries) {
      if (name.toLowerCase() === INSTALL_DIR.toLowerCase()) continue
      await shell.trashItem(join(folder, name))
    }
    await this.rescan()
    this.d.onDownloadsChanged()
  }

  remove(gameId: number): void {
    if (!this.d.repo.removeCatalog(gameId)) throw new Error('Só jogos não instalados podem ser removidos')
  }
}

const norm = (p: string) =>
  resolve(p)
    .replace(/[\\/]+$/, '')
    .toLowerCase()

/** Only ever a direct subfolder of the games folder: never the root itself or anything outside it. */
export const isDirectChild = (folder: string, root: string) => norm(dirname(folder)) === norm(root)

const isInside = (file: string, dir: string) => norm(file).startsWith(norm(dir) + sep)
