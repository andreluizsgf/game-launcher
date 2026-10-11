import { app, clipboard, ipcMain, shell } from 'electron'
import { statfs } from 'fs/promises'
import { parse, resolve } from 'path'
import type { StorageInfo } from '@shared/types'
import { runPower, type PowerAction } from '../system/power'
import { RELEASES_REPO } from '../updater'
import type { IpcContext } from './context'
import { handle } from './result'

/** Downloads status, disk space, power, clipboard, app version/updates/quit. */
export function registerSystem({ settings, downloads, updater, runner }: IpcContext): void {
  ipcMain.handle('downloads:get', () => downloads.current())

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

  handle('system:power', (action: PowerAction) => {
    if (!['sleep', 'restart', 'shutdown'].includes(action)) throw new Error('Ação inválida')
    return runPower(action)
  })
  ipcMain.handle('clipboard:read', () => clipboard.readText())

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('update:get', () => updater.current())
  handle('update:check', () => updater.checkNow())
  ipcMain.handle('update:install', () => {
    // Never yank the launcher from under a running game; it installs on quit anyway.
    if (runner.current() == null) updater.install()
  })
  ipcMain.handle('update:openReleases', () =>
    shell.openExternal(`https://github.com/${RELEASES_REPO.owner}/${RELEASES_REPO.repo}/releases/latest`)
  )
}
