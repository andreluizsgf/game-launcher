import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import type { CatalogHit, Game, Result, Settings, SettingsPatch, StoreSection, TgLoginStep, TgThread } from '@shared/types'
import { cacheArt } from './catalog/art'
import { IgdbClient, imageUrl, type IgdbGame } from './catalog/igdb'
import { StoreService } from './catalog/store'
import { mockSections } from './catalog/storeMock'
import type { CatalogMeta, GamesRepo } from './db/games'
import { scanRoot } from './library/scanner'
import type { Runner } from './library/runner'
import {
  encrypt,
  igdbCredentials,
  normalizePeer,
  publicSettings,
  saveSettings,
  setIgdbSecret,
  type StoredSettings
} from './settings'
import { TelegramService } from './telegram/service'

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
  const telegram = new TelegramService(settings, {
    thread: (t) => getWindow()?.webContents.send('telegram:thread', t),
    progress: (p) => getWindow()?.webContents.send('telegram:progress', p)
  })

  const rescan = async () => {
    if (!settings.gamesRoot) return { added: 0, updated: 0, removed: 0, total: 0 }
    return repo.sync(await scanRoot(settings.gamesRoot))
  }

  const toMeta = async (g: IgdbGame): Promise<CatalogMeta> => ({
    igdbId: g.id,
    title: g.name,
    summary: g.summary ?? null,
    releaseYear: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
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

  ipcMain.handle('catalog:add', async (_e, igdbId: number): Promise<Result<Game>> => {
    try {
      const existing = repo.byIgdbId(igdbId)
      if (existing) return ok(existing)
      const meta = await fetchMeta(igdbId)
      const installed = repo.findUnlinkedInstalled(meta.title)
      return ok(installed ? repo.applyCatalog(installed.id, meta) : repo.addCatalog(meta))
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
    if (patch.telegramTemplate !== undefined) settings.telegramTemplate = patch.telegramTemplate.trim() || '{title}'
    if (patch.telegramApiId !== undefined || patch.telegramPeer !== undefined) {
      if (patch.telegramApiId !== undefined) settings.telegramApiId = patch.telegramApiId || null
      if (patch.telegramPeer !== undefined) settings.telegramPeer = patch.telegramPeer ? normalizePeer(patch.telegramPeer) : null
      await telegram.reset()
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

  ipcMain.handle('telegram:query', async (_e, title: string, force?: boolean): Promise<Result<TgThread>> => {
    try {
      return ok(await telegram.query(title, force))
    } catch (err) {
      return fail(err)
    }
  })
  ipcMain.handle('telegram:openLink', async (_e, url: string): Promise<Result<null>> => {
    try {
      await telegram.openLink(url)
      return ok(null)
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
  ipcMain.handle('telegram:press', async (_e, msgId: number, row: number, col: number): Promise<Result<null>> => {
    try {
      await telegram.press(msgId, row, col)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

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
