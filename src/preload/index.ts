import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { GameEndedEvent, LauncherApi, TgDownloadProgress, TgThread } from '@shared/types'

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
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  setIgdbSecret: (secret) => ipcRenderer.invoke('settings:setIgdbSecret', secret),
  pickGamesRoot: () => ipcRenderer.invoke('settings:pickRoot'),
  pickQbittorrent: () => ipcRenderer.invoke('settings:pickQbittorrent'),
  catalogSearch: (q) => ipcRenderer.invoke('catalog:search', q),
  catalogAdd: (id) => ipcRenderer.invoke('catalog:add', id),
  catalogLink: (gameId, igdbId) => ipcRenderer.invoke('catalog:link', gameId, igdbId),
  storeSections: (force) => ipcRenderer.invoke('store:sections', force),
  setTelegramApiHash: (hash) => ipcRenderer.invoke('settings:setTelegramApiHash', hash),
  telegramLoginPhone: (phone) => ipcRenderer.invoke('telegram:loginPhone', phone),
  telegramLoginCode: (code) => ipcRenderer.invoke('telegram:loginCode', code),
  telegramLoginPassword: (pw) => ipcRenderer.invoke('telegram:loginPassword', pw),
  telegramLogout: () => ipcRenderer.invoke('telegram:logout'),
  telegramQuery: (title, force) => ipcRenderer.invoke('telegram:query', title, force),
  telegramOpenLink: (url) => ipcRenderer.invoke('telegram:openLink', url),
  telegramDownload: (msgId) => ipcRenderer.invoke('telegram:download', msgId),
  telegramPress: (msgId, row, col) => ipcRenderer.invoke('telegram:press', msgId, row, col),
  telegramCommand: (command) => ipcRenderer.invoke('telegram:command', command),
  onTelegramThread: (cb) => on<TgThread>('telegram:thread', cb),
  onTelegramProgress: (cb) => on<TgDownloadProgress>('telegram:progress', cb),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  onGameEnded: (cb) => on<GameEndedEvent>('game:ended', cb),
  onGameStarted: (cb) => on<number>('game:started', cb)
}

contextBridge.exposeInMainWorld('api', api)
