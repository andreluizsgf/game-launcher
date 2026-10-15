import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  DownloadsStatus,
  GameEndedEvent,
  LauncherApi,
  TgDownloadProgress,
  TgThread,
  UpdateState
} from '@shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LauncherApi = {
  listGames: () => ipcRenderer.invoke('library:list'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  launch: (id) => ipcRenderer.invoke('game:launch', id),
  removeGame: (id) => ipcRenderer.invoke('game:remove', id),
  uninstallGame: (id) => ipcRenderer.invoke('game:uninstall', id),
  installGame: (id) => ipcRenderer.invoke('game:install', id),
  cleanInstaller: (id) => ipcRenderer.invoke('game:cleanInstaller', id),
  storeInstall: (id) => ipcRenderer.invoke('game:storeInstall', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  setIgdbSecret: (secret) => ipcRenderer.invoke('settings:setIgdbSecret', secret),
  pickGamesRoot: () => ipcRenderer.invoke('settings:pickRoot'),
  pickQbittorrent: () => ipcRenderer.invoke('settings:pickQbittorrent'),
  catalogSearch: (q, platform) => ipcRenderer.invoke('catalog:search', q, platform),
  catalogAdd: (id) => ipcRenderer.invoke('catalog:add', id),
  catalogLink: (gameId, igdbId) => ipcRenderer.invoke('catalog:link', gameId, igdbId),
  storeSections: (force) => ipcRenderer.invoke('store:sections', force),
  setTelegramApiHash: (hash) => ipcRenderer.invoke('settings:setTelegramApiHash', hash),
  telegramLoginPhone: (phone) => ipcRenderer.invoke('telegram:loginPhone', phone),
  telegramLoginCode: (code) => ipcRenderer.invoke('telegram:loginCode', code),
  telegramLoginPassword: (pw) => ipcRenderer.invoke('telegram:loginPassword', pw),
  telegramLogout: () => ipcRenderer.invoke('telegram:logout'),
  telegramQuery: (title, force, igdbId) => ipcRenderer.invoke('telegram:query', title, force, igdbId),
  telegramOpenLink: (url) => ipcRenderer.invoke('telegram:openLink', url),
  telegramDownload: (msgId) => ipcRenderer.invoke('telegram:download', msgId),
  telegramPress: (msgId, row, col) => ipcRenderer.invoke('telegram:press', msgId, row, col),
  telegramCommand: (command) => ipcRenderer.invoke('telegram:command', command),
  onTelegramThread: (cb) => on<TgThread>('telegram:thread', cb),
  onTelegramProgress: (cb) => on<TgDownloadProgress>('telegram:progress', cb),
  setQbWebPassword: (password) => ipcRenderer.invoke('settings:setQbWebPassword', password),
  setSteamApiKey: (key) => ipcRenderer.invoke('settings:setSteamApiKey', key),
  epicLogin: () => ipcRenderer.invoke('epic:login'),
  pickRomsRoot: () => ipcRenderer.invoke('settings:pickRomsRoot'),
  pickEmulator: (id) => ipcRenderer.invoke('settings:pickEmulator', id),
  epicLogout: () => ipcRenderer.invoke('epic:logout'),
  getDownloads: () => ipcRenderer.invoke('downloads:get'),
  onDownloads: (cb) => on<DownloadsStatus>('downloads:update', cb),
  onLibraryChanged: (cb) => on<string | null>('library:changed', cb),
  storage: () => ipcRenderer.invoke('system:storage'),
  overlayToggle: () => ipcRenderer.invoke('overlay:toggle'),
  overlayHide: () => ipcRenderer.invoke('overlay:hide'),
  onOverlay: (cb) => on<boolean>('overlay:state', cb),
  stopGame: (gameId) => ipcRenderer.invoke('game:stop', gameId),
  achievements: (gameId) => ipcRenderer.invoke('achievements:get', gameId),
  appVersion: () => ipcRenderer.invoke('app:version'),
  updateState: () => ipcRenderer.invoke('update:get'),
  onUpdate: (cb) => on<UpdateState>('update:state', cb),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  openReleases: () => ipcRenderer.invoke('update:openReleases'),
  power: (action) => ipcRenderer.invoke('system:power', action),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  onGameEnded: (cb) => on<GameEndedEvent>('game:ended', cb),
  onGameStarted: (cb) => on<number>('game:started', cb)
}

contextBridge.exposeInMainWorld('api', api)
