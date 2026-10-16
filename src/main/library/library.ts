import { shell } from 'electron'
import { mkdirSync, promises as fs, writeFileSync } from 'fs'
import { basename, dirname, join, resolve, sep } from 'path'
import { systemById } from '@shared/systems'
import type { EmulatorAction, ScanResult } from '@shared/types'
import { titlesMatch } from '@shared/titleKey'
import { download } from '../catalog/art'
import type { GamesRepo } from '../db/games'
import { launchArgs, missingEmulator, RETROARCH_OVERRIDES } from '../emulators/launch'
import { sendRetroArch } from '../emulators/retroarchCmd'
import { scanRoms } from '../emulators/scan'
import { gameFolderOf } from '../downloads/match'
import type { QbWebApi } from '../downloads/qbWebApi'
import { ownedEpicGames, scanEpic } from '../platforms/epic'
import type { EpicAccount } from '../platforms/epicAccount'
import { ownedSteamGames, scanSteam, steamArt, type PlatformGame } from '../platforms/steam'
import { decrypt, emulatorPath, igdbCredentials, type StoredSettings } from '../settings'
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
  epic: EpicAccount
  artDir: string
  /** Something on disk changed (e.g. a torrent was dropped): re-poll downloads. */
  onDownloadsChanged(): void
  /** The list changed outside a rescan the renderer awaited (e.g. artwork arrived). */
  onChanged(): void
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
    await this.syncEmulated().catch((err) => console.warn('[emulators] sync failed', err))
    return result
  }

  /**
   * Store libraries: installed Steam/Epic games plus, when the account list is available, the ones owned
   * but not installed. Artwork for new rows downloads in the background (a first sync can be hundreds).
   */
  private async syncPlatforms(): Promise<void> {
    const { repo, settings } = this.d
    const steamKey = decrypt(settings.steamApiKeyEnc)
    const steamOwned = !settings.steamLibrary || !steamKey ? [] : await ownedSteamGames(steamKey).catch(warn)
    const steam = settings.steamLibrary ? merge(await scanSteam(), steamOwned) : []
    const steamNew = repo.syncPlatform('steam', steam, steamOwned !== null)

    // Signed in: the whole account. Otherwise the launcher's local cache (only part of the library).
    const epicOwned = !settings.epicLibrary
      ? []
      : this.d.epic.signedIn()
        ? await this.d.epic.ownedGames().catch(warn)
        : ownedEpicGames()
    const epic = settings.epicLibrary ? merge(scanEpic(), epicOwned) : []
    const epicNew = repo.syncPlatform('epic', epic, epicOwned !== null)

    const art = new Map((epicOwned ?? []).map((g) => [g.externalId, g.art]))
    if (steamNew.length || epicNew.length) {
      void this.fetchArt(steamNew, epicNew, art).then(() => this.d.onChanged())
    }
  }

  private async fetchArt(
    steamIds: number[],
    epicIds: number[],
    epicArt: Map<string, PlatformGame['art']>
  ): Promise<void> {
    const { repo, settings, catalog, artDir } = this.d
    mkdirSync(artDir, { recursive: true })
    const save = async (id: number, prefix: string, cover: string | null, wide: string | null) => {
      const [c, w] = await Promise.all([
        cover ? download(cover, join(artDir, `${prefix}-cover.jpg`)) : null,
        wide ? download(wide, join(artDir, `${prefix}-art.jpg`)) : null
      ])
      repo.setArt(id, c, w)
    }
    const steamJobs = steamIds.map((id) => async () => {
      const g = repo.get(id)
      if (!g?.externalId) return
      const art = steamArt(g.externalId)
      await save(id, `steam-${g.externalId}`, art.cover, art.art)
    })
    const epicJobs = epicIds.map((id) => async () => {
      const g = repo.get(id)
      if (!g?.externalId) return
      const art = epicArt.get(g.externalId)
      if (art) await save(id, `epic-${g.externalId.replace(/[^\w-]/g, '_')}`, art.cover, art.wide)
      // Installed ones also get catalog data (summary, genres) from IGDB, when it's set up.
      if (!g.folder || !igdbCredentials(settings)) return
      try {
        const hit = (await catalog.igdb.search(g.title)).find((h) => titlesMatch(h.name, g.title))
        if (hit && !repo.byIgdbId(hit.id)) repo.applyCatalog(id, await catalog.toMeta(hit))
      } catch {
        // Offline / IGDB down: it stays with its Epic name; "Identificar jogo" works later.
      }
    })
    await pool([...steamJobs, ...epicJobs], 6)
  }

  /** In-game menu of an emulated game: commands to the RetroArch it's running in. */
  async emulatorAction(gameId: number, action: EmulatorAction): Promise<void> {
    const game = this.d.repo.get(gameId)
    if (this.d.runner.current() !== gameId) throw new Error('O jogo não está rodando')
    if (systemById(game?.platform)?.emulator !== 'retroarch') throw new Error('Só disponível no RetroArch')
    await sendRetroArch(action)
  }

  /** Not-installed Steam/Epic game: the store's install dialog. */
  async storeInstall(gameId: number): Promise<void> {
    const game = this.d.repo.get(gameId)
    if (!game || game.folder || game.source === 'folder' || !game.launchUri) throw new Error('Nada pra instalar')
    await shell.openExternal(game.launchUri)
  }

  /** ROMs folder → emulated games; new ones get looked up on IGDB (that console) in the background. */
  private async syncEmulated(): Promise<void> {
    const { repo, settings } = this.d
    const rpcs3 = emulatorPath(settings, 'rpcs3')
    const roms = settings.romsRoot ? await scanRoms(settings.romsRoot, rpcs3 ? dirname(rpcs3) : null) : []
    const added = repo.syncPlatform('emulator', roms)
    if (added.length && igdbCredentials(settings)) void this.identifyEmulated(added).then(() => this.d.onChanged())
  }

  private async identifyEmulated(ids: number[]): Promise<void> {
    const { repo, catalog } = this.d
    const jobs = ids.map((id) => async () => {
      const g = repo.get(id)
      const system = systemById(g?.platform)
      if (!g || !system) return
      const hit = (await catalog.igdb.search(g.title, system.igdbPlatform)).find((h) => titlesMatch(h.name, g.title))
      if (hit && !repo.byIgdbId(hit.id)) repo.applyCatalog(id, await catalog.toMeta(hit))
    })
    // IGDB allows 4 requests/s; a first ROMs scan can be hundreds of games.
    await pool(jobs, 2)
  }

  async launch(gameId: number): Promise<void> {
    const game = this.d.repo.get(gameId)
    if (!game) throw new Error('Jogo não encontrado')
    if (!game.folder) throw new Error('Jogo não instalado')
    if (game.source !== 'emulator') return this.d.runner.launch(game)
    const system = systemById(game.platform)
    if (!system) throw new Error('Sistema desconhecido')
    const exe = emulatorPath(this.d.settings, system.emulator)
    if (!exe) throw missingEmulator(system.emulator)
    let overrides: string | undefined
    if (system.emulator === 'retroarch') {
      // Next to the art cache, in the app's data folder.
      overrides = join(dirname(this.d.artDir), 'retroarch-overrides.cfg')
      writeFileSync(overrides, RETROARCH_OVERRIDES)
    }
    const args = launchArgs(system, exe, game.folder, overrides)
    await this.d.runner.launch(game, { exe, args, watch: dirname(exe) })
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
    if (game.source === 'emulator') throw new Error('Apague a ROM pela pasta de ROMs')
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

/** Installed games win over the same id in the owned list. */
function merge(installed: PlatformGame[], owned: PlatformGame[] | null): PlatformGame[] {
  const ids = new Set(installed.map((g) => g.externalId))
  return [...installed, ...(owned ?? []).filter((g) => !ids.has(g.externalId))]
}

function warn(err: unknown): null {
  console.warn('[platforms] owned games unavailable', err)
  return null
}

/** Runs jobs with at most `size` at a time. */
async function pool(jobs: Array<() => Promise<void>>, size: number): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]().catch(() => {})
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker))
}
