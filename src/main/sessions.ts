import { globalShortcut, ipcMain, type BrowserWindow } from 'electron'
import type { InputMode } from '@shared/types'
import type { XusbReport } from '@shared/xusb'
import type { GamesRepo } from './db/games'
import { handle } from './ipc/result'
import { Runner } from './library/runner'
import type { StoredSettings } from './settings'
import { Xbox360Pad } from './vpad/vigem'
import { bringToFront, getOutOfTheWay } from './window'

/** Virtual Xbox 360 pad fed by the DualSense, for games with `inputMode: 'xinput'` (ADR 0018). */
const xboxPad = new Xbox360Pad()

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
  const send = (channel: string, payload: unknown) => getWindow()?.webContents.send(channel, payload)

  // Plug/unplug one at a time: closing the bus handle while a plug is pending would race it.
  let padFor: number | null = null
  let padOps = Promise.resolve()
  const setPad = (gameId: number | null) => {
    padFor = gameId
    padOps = padOps.then(async () => {
      if (padFor !== gameId) return // superseded while queued
      if (gameId == null) {
        xboxPad.close()
        return send('vpad:active', false)
      }
      try {
        await xboxPad.plug()
        send('vpad:active', true)
      } catch (err) {
        padFor = null
        send('library:changed', (err as Error).message)
      }
    })
  }

  const runner: Runner = new Runner({
    onStart(game, startedAt) {
      sessions.set(game.id, repo.startSession(game.id, startedAt))
      const win = getWindow()
      win?.webContents.send('game:started', game.id)
      if (win) getOutOfTheWay(win)
      globalShortcut.register(OVERLAY_SHORTCUT, toggleOverlay)
      // XInput is hot-plug: games pick the pad up whenever it appears, so no need to plug before launching.
      if (game.inputMode === 'xinput') setPad(game.id)
    },
    onEnd(game, _startedAt, endedAt, playedMs) {
      const seconds = Math.round(playedMs / 1000)
      const sessionId = sessions.get(game.id)
      sessions.delete(game.id)
      if (sessionId) repo.endSession(sessionId, game.id, endedAt, seconds)
      globalShortcut.unregister(OVERLAY_SHORTCUT)
      if (padFor != null) setPad(null)
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
    // The pad still reaches the game in the background: pausing it keeps the menu from playing it.
    const id = runner.current()
    if (settings.pauseOnOverlay && id != null) void runner.setFrozen(id, true)
  }
  const hideOverlay = () => {
    // Also when the user Alt+Tabbed here instead of using the shortcut.
    const win = getWindow()
    if (!win || runner.current() == null) return
    win.webContents.send('overlay:state', false)
    void runner.setFrozen(runner.current()!, false)
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
  // Takes effect right away when that game is the one running.
  handle('game:setInputMode', (gameId: number, mode: InputMode) => {
    repo.setInputMode(gameId, mode)
    if (runner.current() === gameId) setPad(mode === 'xinput' ? gameId : null)
  })
  ipcMain.on('vpad:report', (_e, report: XusbReport) => xboxPad.submit(report))

  return runner
}

export function releaseShortcuts(): void {
  globalShortcut.unregisterAll()
}

/** On quit: the bus would drop the pad with the process anyway, this just does it first. */
export function closeVirtualPad(): void {
  xboxPad.close()
}
