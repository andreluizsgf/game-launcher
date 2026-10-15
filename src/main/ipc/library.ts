import { ipcMain } from 'electron'
import type { GameAchievements } from '@shared/types'
import { mockSections } from '../catalog/storeMock'
import { bringToFront, getOutOfTheWay } from '../window'
import type { IpcContext } from './context'
import { handle } from './result'

/** Library, games, catalog/store and achievements. */
export function registerLibrary({ repo, library, catalog, store, awn, settings, getWindow }: IpcContext): void {
  ipcMain.handle('library:list', () => repo.list())
  ipcMain.handle('library:rescan', () => library.rescan())

  handle('game:launch', (gameId: number) => library.launch(gameId))
  handle('game:uninstall', (gameId: number) => library.uninstall(gameId))
  handle('game:remove', (gameId: number) => library.remove(gameId))
  // The installer gets the screen; the launcher comes back when it closes.
  handle('game:install', async (gameId: number) => {
    const win = getWindow()
    if (win) getOutOfTheWay(win)
    try {
      await library.install(gameId)
    } finally {
      if (win && !win.isDestroyed()) bringToFront(win, settings.fullscreen)
    }
  })
  handle('game:cleanInstaller', (gameId: number) => library.cleanInstaller(gameId))
  handle('game:storeInstall', (gameId: number) => library.storeInstall(gameId))

  handle('catalog:search', (query: string, platform?: string | null) => catalog.search(query, platform))
  handle('catalog:add', (igdbId: number) => catalog.add(igdbId))
  handle('catalog:link', (gameId: number, igdbId: number) => catalog.link(gameId, igdbId))
  handle('store:sections', (force?: boolean) => (process.env.GL_STORE_MOCK ? mockSections() : store.sections(force)))

  ipcMain.handle('achievements:get', (_e, gameId: number): GameAchievements | null => {
    const game = repo.get(gameId)
    return game ? awn.forGame(game) : null
  })
}
