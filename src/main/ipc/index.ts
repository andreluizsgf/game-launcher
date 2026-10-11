import { app, type BrowserWindow } from 'electron'
import { join } from 'path'
import { AwnReader, awnDataDir } from '../achievements/awn'
import { IgdbClient } from '../catalog/igdb'
import { StoreService } from '../catalog/store'
import type { GamesRepo } from '../db/games'
import { QbWebApi } from '../downloads/qbWebApi'
import { DownloadWatcher } from '../downloads/watcher'
import { Catalog } from '../library/catalog'
import { Library } from '../library/library'
import type { Runner } from '../library/runner'
import { decrypt, igdbCredentials, type StoredSettings } from '../settings'
import { TelegramService } from '../telegram/service'
import { Updater } from '../updater'
import type { IpcContext } from './context'
import { registerLibrary } from './library'
import { registerSettings } from './settings'
import { registerSystem } from './system'
import { registerTelegram } from './telegram'

interface Deps {
  repo: GamesRepo
  runner: Runner
  settings: StoredSettings
  getWindow(): BrowserWindow | null
}

/** Builds the main-process services, wires them together and registers every IPC channel. */
export function registerIpc({ repo, runner, settings, getWindow }: Deps): void {
  const send = (channel: string, payload: unknown) => getWindow()?.webContents.send(channel, payload)
  const artDir = join(app.getPath('userData'), 'art')

  const igdb = new IgdbClient(() => igdbCredentials(settings))
  const catalog = new Catalog(igdb, repo, artDir)
  const store = new StoreService(igdb, (igdbId) => repo.byIgdbId(igdbId)?.id ?? null)
  const qbWeb = new QbWebApi(() => ({
    url: settings.qbWebUrl,
    username: settings.qbWebUser,
    password: decrypt(settings.qbWebPasswordEnc)
  }))

  // Library ⇄ downloads: a finished download triggers a rescan; uninstalling re-polls downloads.
  const downloads: DownloadWatcher = new DownloadWatcher({
    api: qbWeb,
    gamesRoot: () => settings.gamesRoot,
    games: () => repo.list(),
    emit: (status) => send('downloads:update', status),
    onCompleted: async (item) => {
      await library.rescan()
      send('library:changed', `${item.title} baixado — pronto pra jogar`)
    }
  })
  const library = new Library({
    repo,
    runner,
    settings,
    catalog,
    qbWeb,
    artDir,
    onDownloadsChanged: () => downloads.poke()
  })

  const telegram = new TelegramService(settings, qbWeb, {
    thread: (t) => send('telegram:thread', t),
    progress: (p) => send('telegram:progress', p),
    downloadStarted: async ({ title, igdbId }) => {
      downloads.poke()
      if (!igdbId || repo.byIgdbId(igdbId)) return
      try {
        await catalog.add(igdbId)
        send('library:changed', `${title} adicionado à biblioteca`)
      } catch {
        // Download still runs; the game shows up when the scan finds its folder.
      }
    }
  })

  const updater = new Updater((s) => send('update:state', s))
  // GL_AWN_DIR: dev override pointing at a fake AWN data folder.
  const awn = new AwnReader(() => process.env.GL_AWN_DIR || awnDataDir(app.getPath('appData')))

  const ctx: IpcContext = {
    repo,
    runner,
    settings,
    catalog,
    library,
    store,
    downloads,
    telegram,
    updater,
    awn,
    getWindow
  }
  registerLibrary(ctx)
  registerSettings(ctx)
  registerTelegram(ctx)
  registerSystem(ctx)

  downloads.start()
  updater.start()
}
