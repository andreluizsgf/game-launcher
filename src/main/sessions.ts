import { globalShortcut, ipcMain, type BrowserWindow } from 'electron'
import type { GamesRepo } from './db/games'
import { handle } from './ipc/result'
import { Runner } from './library/runner'
import type { StoredSettings } from './settings'
import { bringToFront, getOutOfTheWay } from './window'

/** Keyboard way into the in-game overlay (registered only while a game runs). */
const OVERLAY_SHORTCUT = 'CommandOrControl+Shift+G'

/**
 * Game sessions: playtime bookkeeping, handing the screen to the game and back, and the in-game
 * overlay — the launcher brought over the running game (PS button / Ctrl+Shift+G), fully navigable.
 * Not drawn inside the game: exclusive-fullscreen games minimize, like Alt+Tab.
 */
export function createGameSessions(
  repo: GamesRepo,
  settings: StoredSettings,
  getWindow: () => BrowserWindow | null
): Runner {
  const sessions = new Map<number, number>()

  const runner: Runner = new Runner({
    onStart(game, startedAt) {
      sessions.set(game.id, repo.startSession(game.id, startedAt))
      const win = getWindow()
      win?.webContents.send('game:started', game.id)
      if (win) getOutOfTheWay(win)
      globalShortcut.register(OVERLAY_SHORTCUT, toggleOverlay)
    },
    onEnd(game, startedAt, endedAt) {
      const seconds = Math.round((endedAt - startedAt) / 1000)
      const sessionId = sessions.get(game.id)
      sessions.delete(game.id)
      if (sessionId) repo.endSession(sessionId, game.id, endedAt, seconds)
      globalShortcut.unregister(OVERLAY_SHORTCUT)
      const win = getWindow()
      if (win) {
        bringToFront(win, settings.fullscreen)
        win.webContents.send('game:ended', { gameId: game.id, seconds })
      }
    }
  })

  const showOverlay = () => {
    const win = getWindow()
    if (!win || runner.current() == null) return
    bringToFront(win, settings.fullscreen)
    win.webContents.send('overlay:state', true)
  }
  const hideOverlay = () => {
    // Also when the user Alt+Tabbed here instead of using the shortcut.
    const win = getWindow()
    if (!win || runner.current() == null) return
    win.webContents.send('overlay:state', false)
    getOutOfTheWay(win)
  }
  function toggleOverlay(): void {
    const win = getWindow()
    if (win?.isFocused() && !win.isMinimized()) hideOverlay()
    else showOverlay()
  }

  ipcMain.handle('overlay:toggle', () => toggleOverlay())
  ipcMain.handle('overlay:hide', () => hideOverlay())
  handle('game:stop', (gameId: number) => runner.stop(gameId))

  return runner
}

export function releaseShortcuts(): void {
  globalShortcut.unregisterAll()
}
