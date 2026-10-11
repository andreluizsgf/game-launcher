import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { statfs } from 'fs/promises'
import { basename, dirname, join, parse, resolve } from 'path'
import type { GameAchievements, StorageInfo } from '@shared/types'
import { AwnReader, awnDataDir } from './achievements/awn'
import type { CatalogHit, Game, Result, Settings, SettingsPatch, StoreSection, TgLoginStep, TgThread } from '@shared/types'
import { cacheArt } from './catalog/art'
import { IgdbClient, imageUrl, type IgdbGame } from './catalog/igdb'
import { StoreService } from './catalog/store'
import { mockSections } from './catalog/storeMock'
import type { CatalogMeta, GamesRepo } from './db/games'
import { scanRoot } from './library/scanner'
import type { Runner } from './library/runner'
import { gameFolderOf } from './downloads/match'
import { QbWebApi } from './downloads/qbWebApi'
import { DownloadWatcher } from './downloads/watcher'
import {
  applyOpenAtLogin,
  decrypt,
  encrypt,
  igdbCredentials,
  normalizePeer,
  publicSettings,
  saveSettings,
  setIgdbSecret,
  type StoredSettings
} from './settings'
import { resolveQbittorrent } from './telegram/qbittorrent'
import { runPower, type PowerAction } from './system/power'
import { TelegramService } from './telegram/service'
import { RELEASES_REPO, Updater } from './updater'

interface Deps {
  repo: GamesRepo
  runner: Runner
  settings: StoredSettings
  getWindow(): BrowserWindow | null
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof Error ? err.message : String(err) })

export function registerIpc({ repo, runner, settings, getWindow }: Deps): void {
  const igdb = new IgdbClient(() => igdbCredentials(settings))
  const artDir = join(app.getPath('userData'), 'art')
  const store = new StoreService(igdb, (igdbId) => repo.byIgdbId(igdbId)?.id ?? null)
  const send = (channel: string, payload: unknown) => getWindow()?.webContents.send(channel, payload)
  const qbWeb = new QbWebApi(() => ({
    url: settings.qbWebUrl,
    username: settings.qbWebUser,
    password: decrypt(settings.qbWebPasswordEnc)
  }))
  const downloads = new DownloadWatcher({
    api: qbWeb,
    gamesRoot: () => settings.gamesRoot,
    games: () => repo.list(),
    emit: (status) => send('downloads:update', status),
    onCompleted: async (item) => {
      await rescan()
      send('library:changed', `${item.title} baixado — pronto pra jogar`)
    }
  })
  const telegram = new TelegramService(settings, qbWeb, {
    thread: (t) => send('telegram:thread', t),
    progress: (p) => send('telegram:progress', p),
    downloadStarted: async ({ title, igdbId }) => {
      downloads.poke()
      if (!igdbId || repo.byIgdbId(igdbId)) return
      try {
        await addFromCatalog(igdbId)
        send('library:changed', `${title} adicionado à biblioteca`)
      } catch {
        // Download still runs; the game shows up when the scan finds its folder.
      }
    }
  })
  downloads.start()

  const rescan = async () => {
    if (!settings.gamesRoot) return { added: 0, updated: 0, removed: 0, total: 0 }
    return repo.sync(await scanRoot(settings.gamesRoot))
  }

  const toMeta = async (g: IgdbGame): Promise<CatalogMeta> => ({
    igdbId: g.id,
    title: g.name,
    summary: g.summary ?? null,
    releaseYear: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    releaseDate: g.first_release_date ? g.first_release_date * 1000 : null,
    genres: (g.genres ?? []).map((x) => x.name),
    ...(await cacheArt(artDir, g))
  })

  const fetchMeta = async (igdbId: number): Promise<CatalogMeta> => {
    const g = await igdb.get(igdbId)
    if (!g) throw new Error('Jogo não encontrado no IGDB')
    return toMeta(g)
  }

  ipcMain.handle('library:list', () => repo.list())
  ipcMain.handle('library:rescan', rescan)

  ipcMain.handle('game:launch', async (_e, gameId: number): Promise<Result<null>> => {
    const game = repo.get(gameId)
    if (!game) return fail('Jogo não encontrado')
    if (!game.folder) return fail('Jogo não instalado')
    try {
      await runner.launch(game)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('game:uninstall', async (_e, gameId: number): Promise<Result<null>> => {
    const game = repo.get(gameId)
    const root = settings.gamesRoot
    if (!game?.folder) return fail('Jogo não instalado')
    if (runner.current() === gameId) return fail('Feche o jogo antes de desinstalar')
    // Only ever a direct subfolder of the games folder: never the root itself or anything outside it.
    const norm = (p: string) => resolve(p).replace(/[\\/]+$/, '').toLowerCase()
    if (!root || norm(dirname(game.folder)) !== norm(root)) {
      return fail('Por segurança, só jogos dentro da pasta de jogos podem ser desinstalados pelo app')
    }
    try {
      // Drop its torrent first, or qBittorrent keeps it in error ("missing files").
      const hashes = (await qbWeb.torrents().catch(() => []))
        .filter((t) => gameFolderOf(t, root) === basename(game.folder!))
        .map((t) => t.hash)
      await qbWeb.remove(hashes, false).catch(() => {})
      await shell.trashItem(game.folder)
      repo.uninstall(gameId)
      downloads.poke()
      return ok(null)
    } catch (err) {
      return fail(`Não deu pra mover a pasta pra Lixeira: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle('game:remove', (_e, gameId: number): Result<null> =>
    repo.removeCatalog(gameId) ? ok(null) : fail('Só jogos não instalados podem ser removidos')
  )

  ipcMain.handle('catalog:search', async (_e, query: string): Promise<Result<CatalogHit[]>> => {
    try {
      const games = await igdb.search(query)
      return ok(
        games.map((g) => ({
          igdbId: g.id,
          name: g.name,
          year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
          coverUrl: g.cover ? imageUrl(g.cover.image_id, 'cover_big') : null,
          inLibraryId: repo.byIgdbId(g.id)?.id ?? null
        }))
      )
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('store:sections', async (_e, force?: boolean): Promise<Result<StoreSection[]>> => {
    try {
      if (process.env.GL_STORE_MOCK) return ok(mockSections())
      return ok(await store.sections(force))
    } catch (err) {
      return fail(err)
    }
  })

  /** Adds a catalog game; merges into an installed game with the same title when there is one. */
  const addFromCatalog = async (igdbId: number): Promise<Game> => {
    const existing = repo.byIgdbId(igdbId)
    if (existing) return existing
    const meta = await fetchMeta(igdbId)
    const installed = repo.findUnlinkedInstalled(meta.title)
    return installed ? repo.applyCatalog(installed.id, meta) : repo.addCatalog(meta)
  }

  ipcMain.handle('catalog:add', async (_e, igdbId: number): Promise<Result<Game>> => {
    try {
      return ok(await addFromCatalog(igdbId))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('catalog:link', async (_e, gameId: number, igdbId: number): Promise<Result<Game>> => {
    try {
      const other = repo.byIgdbId(igdbId)
      if (other && other.id !== gameId) {
        // Linking an installed game to a catalog entry that is only on the wishlist: absorb it.
        if (!other.folder) repo.removeCatalog(other.id)
        else return fail(`"${other.title}" já está ligado a esse jogo`)
      }
      return ok(repo.applyCatalog(gameId, await fetchMeta(igdbId)))
    } catch (err) {
      return fail(err)
    }
  })

  const pub = (): Settings => publicSettings(settings)

  ipcMain.handle('settings:get', pub)
  ipcMain.handle('settings:set', async (_e, patch: SettingsPatch) => {
    if (patch.gamesRoot !== undefined) settings.gamesRoot = patch.gamesRoot
    if (patch.igdbClientId !== undefined) settings.igdbClientId = patch.igdbClientId?.trim() || null
    if (patch.qbWebUrl !== undefined) settings.qbWebUrl = patch.qbWebUrl.trim().replace(/\/+$/, '') || 'http://localhost:8080'
    if (patch.qbWebUser !== undefined) settings.qbWebUser = patch.qbWebUser?.trim() || null
    if (patch.qbWebUrl !== undefined || patch.qbWebUser !== undefined || patch.gamesRoot !== undefined) downloads.poke()
    if (patch.telegramTemplate !== undefined) settings.telegramTemplate = patch.telegramTemplate.trim() || '{title}'
    if (patch.telegramApiId !== undefined || patch.telegramPeer !== undefined) {
      if (patch.telegramApiId !== undefined) settings.telegramApiId = patch.telegramApiId || null
      if (patch.telegramPeer !== undefined) settings.telegramPeer = patch.telegramPeer ? normalizePeer(patch.telegramPeer) : null
      await telegram.reset()
    }
    if (patch.openAtLogin !== undefined) {
      settings.openAtLogin = patch.openAtLogin
      applyOpenAtLogin(patch.openAtLogin)
    }
    if (patch.fullscreen !== undefined) {
      settings.fullscreen = patch.fullscreen
      getWindow()?.setFullScreen(settings.fullscreen)
    }
    saveSettings(settings)
    return pub()
  })
  ipcMain.handle('settings:setIgdbSecret', (_e, secret: string) => {
    setIgdbSecret(settings, secret)
    saveSettings(settings)
    return pub()
  })

  ipcMain.handle('settings:setTelegramApiHash', async (_e, hash: string) => {
    settings.telegramApiHashEnc = encrypt(hash)
    saveSettings(settings)
    await telegram.reset()
    return pub()
  })

  const loginStep =
    (fn: (v: string) => Promise<TgLoginStep>) =>
    async (_e: unknown, v: string): Promise<Result<TgLoginStep>> => {
      try {
        return ok(await fn(v))
      } catch (err) {
        return fail(err)
      }
    }
  ipcMain.handle('telegram:loginPhone', loginStep((v) => telegram.loginPhone(v)))
  ipcMain.handle('telegram:loginCode', loginStep((v) => telegram.loginCode(v)))
  ipcMain.handle('telegram:loginPassword', loginStep((v) => telegram.loginPassword(v)))
  ipcMain.handle('telegram:logout', async () => {
    await telegram.logout()
    return pub()
  })

  ipcMain.handle(
    'telegram:query',
    async (_e, title: string, force?: boolean, igdbId?: number | null): Promise<Result<TgThread>> => {
      try {
        return ok(await telegram.query(title, force, igdbId ?? null))
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle('downloads:get', () => downloads.current())
  ipcMain.handle('settings:setQbWebPassword', (_e, password: string) => {
    settings.qbWebPasswordEnc = encrypt(password)
    saveSettings(settings)
    downloads.poke()
    return pub()
  })
  ipcMain.handle('telegram:openLink', async (_e, url: string) => {
    try {
      return ok(await telegram.openLink(url))
    } catch (err) {
      return fail(err)
    }
  })
  ipcMain.handle('telegram:download', async (_e, msgId: number): Promise<Result<string>> => {
    try {
      return ok(await telegram.download(msgId))
    } catch (err) {
      return fail(err)
    }
  })
  ipcMain.handle('telegram:command', async (_e, command: string): Promise<Result<null>> => {
    try {
      await telegram.command(command)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })
  ipcMain.handle('telegram:press', async (_e, msgId: number, row: number, col: number): Promise<Result<null>> => {
    try {
      await telegram.press(msgId, row, col)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('settings:pickQbittorrent', async () => {
    const win = getWindow()
    const opts = {
      properties: ['openFile' as const],
      title: 'qBittorrent',
      defaultPath: process.platform === 'darwin' ? '/Applications' : undefined
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (!res.canceled && res.filePaths[0]) {
      settings.qbittorrentPath = resolveQbittorrent(res.filePaths[0])
      saveSettings(settings)
    }
    return pub()
  })

  ipcMain.handle('system:storage', async (): Promise<StorageInfo | null> => {
    const path = settings.gamesRoot ?? app.getPath('home')
    try {
      const s = await statfs(path)
      const root = parse(resolve(path)).root
      return { label: root.replace(/[\\/]+$/, '') || '/', free: s.bavail * s.bsize, total: s.blocks * s.bsize }
    } catch {
      return null
    }
  })

  // GL_AWN_DIR: dev override pointing at a fake AWN data folder.
  const awn = new AwnReader(() => process.env.GL_AWN_DIR || awnDataDir(app.getPath('appData')))
  ipcMain.handle('achievements:get', (_e, gameId: number): GameAchievements | null => {
    const game = repo.get(gameId)
    return game ? awn.forGame(game) : null
  })

  const updater = new Updater((s) => send('update:state', s))
  updater.start()
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:get', () => updater.current())
  ipcMain.handle('update:install', () => {
    // Never yank the launcher from under a running game; it installs on quit anyway.
    if (runner.current() == null) updater.install()
  })
  ipcMain.handle('update:openReleases', () =>
    shell.openExternal(`https://github.com/${RELEASES_REPO.owner}/${RELEASES_REPO.repo}/releases/latest`)
  )

  ipcMain.handle('system:power', async (_e, action: PowerAction): Promise<Result<null>> => {
    if (!['sleep', 'restart', 'shutdown'].includes(action)) return fail('Ação inválida')
    try {
      await runPower(action)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('clipboard:read', () => clipboard.readText())

  ipcMain.handle('settings:pickRoot', async () => {
    const win = getWindow()
    const opts = { properties: ['openDirectory' as const], title: 'Pasta de jogos' }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    settings.gamesRoot = res.filePaths[0]
    saveSettings(settings)
    await rescan()
    return settings.gamesRoot
  })
}
