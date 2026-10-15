import type { BrowserWindow } from 'electron'
import type { AwnReader } from '../achievements/awn'
import type { StoreService } from '../catalog/store'
import type { GamesRepo } from '../db/games'
import type { DownloadWatcher } from '../downloads/watcher'
import type { Catalog } from '../library/catalog'
import type { Library } from '../library/library'
import type { Runner } from '../library/runner'
import type { EpicAccount } from '../platforms/epicAccount'
import type { StoredSettings } from '../settings'
import type { TelegramService } from '../telegram/service'
import type { Updater } from '../updater'

/** Everything the IPC handlers work with, built once in ./index.ts. */
export interface IpcContext {
  repo: GamesRepo
  runner: Runner
  settings: StoredSettings
  catalog: Catalog
  library: Library
  store: StoreService
  downloads: DownloadWatcher
  telegram: TelegramService
  updater: Updater
  awn: AwnReader
  epic: EpicAccount
  getWindow(): BrowserWindow | null
}
