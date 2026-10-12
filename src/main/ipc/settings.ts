import { dialog, ipcMain } from 'electron'
import type { Settings, SettingsPatch } from '@shared/types'
import { applyOpenAtLogin, encrypt, normalizePeer, publicSettings, saveSettings, setIgdbSecret } from '../settings'
import { resolveQbittorrent } from '../telegram/qbittorrent'
import type { IpcContext } from './context'

/** Settings: plain values, secrets (encrypted at rest) and folder/app pickers. */
export function registerSettings({ settings, downloads, telegram, library, getWindow }: IpcContext): void {
  const pub = (): Settings => publicSettings(settings)
  const save = () => {
    saveSettings(settings)
    return pub()
  }
  const pick = async (opts: Electron.OpenDialogOptions) => {
    const win = getWindow()
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  }

  ipcMain.handle('settings:get', pub)

  ipcMain.handle('settings:set', async (_e, patch: SettingsPatch) => {
    if (patch.gamesRoot !== undefined) settings.gamesRoot = patch.gamesRoot
    if (patch.steamLibrary !== undefined) settings.steamLibrary = patch.steamLibrary
    if (patch.epicLibrary !== undefined) settings.epicLibrary = patch.epicLibrary
    if (patch.igdbClientId !== undefined) settings.igdbClientId = patch.igdbClientId?.trim() || null
    if (patch.qbWebUrl !== undefined)
      settings.qbWebUrl = patch.qbWebUrl.trim().replace(/\/+$/, '') || 'http://localhost:8080'
    if (patch.qbWebUser !== undefined) settings.qbWebUser = patch.qbWebUser?.trim() || null
    if (patch.qbWebUrl !== undefined || patch.qbWebUser !== undefined || patch.gamesRoot !== undefined) downloads.poke()
    if (patch.telegramTemplate !== undefined) settings.telegramTemplate = patch.telegramTemplate.trim() || '{title}'
    if (patch.telegramApiId !== undefined || patch.telegramPeer !== undefined) {
      if (patch.telegramApiId !== undefined) settings.telegramApiId = patch.telegramApiId || null
      if (patch.telegramPeer !== undefined)
        settings.telegramPeer = patch.telegramPeer ? normalizePeer(patch.telegramPeer) : null
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
    return save()
  })

  ipcMain.handle('settings:setIgdbSecret', (_e, secret: string) => {
    setIgdbSecret(settings, secret)
    return save()
  })
  ipcMain.handle('settings:setTelegramApiHash', async (_e, hash: string) => {
    settings.telegramApiHashEnc = encrypt(hash)
    await telegram.reset()
    return save()
  })
  ipcMain.handle('settings:setQbWebPassword', (_e, password: string) => {
    settings.qbWebPasswordEnc = encrypt(password)
    downloads.poke()
    return save()
  })

  ipcMain.handle('settings:setSteamApiKey', async (_e, key: string) => {
    settings.steamApiKeyEnc = encrypt(key)
    saveSettings(settings)
    await library.rescan()
    return pub()
  })

  ipcMain.handle('settings:pickRoot', async () => {
    const folder = await pick({ properties: ['openDirectory'], title: 'Pasta de jogos' })
    if (!folder) return null
    settings.gamesRoot = folder
    saveSettings(settings)
    await library.rescan()
    return settings.gamesRoot
  })
  ipcMain.handle('settings:pickQbittorrent', async () => {
    const file = await pick({
      properties: ['openFile'],
      title: 'qBittorrent',
      defaultPath: process.platform === 'darwin' ? '/Applications' : undefined
    })
    if (file) settings.qbittorrentPath = resolveQbittorrent(file)
    return save()
  })
}
