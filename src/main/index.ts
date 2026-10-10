import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { openDb } from './db/schema'
import { GamesRepo } from './db/games'
import { runDevSnapshot } from './devSnapshot'
import { registerIpc } from './ipc'
import { Runner } from './library/runner'
import { applyOpenAtLogin, AUTOSTART_ARG, loadSettings } from './settings'

// Local covers are served through media://local/<encoded absolute path>
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let win: BrowserWindow | null = null

/** Keyboard way into the in-game quick menu (registered only while a game runs). */
const OVERLAY_SHORTCUT = 'CommandOrControl+Shift+G'

const SONY_VENDOR_ID = 0x054c

/**
 * Lets the renderer read Sony pads over WebHID without a device picker. Chromium's Gamepad API
 * often misses the DualSense over Bluetooth on Windows; HID sees it (that's how Steam reads it).
 */
function grantSonyHid(w: BrowserWindow): void {
  const ses = w.webContents.session
  ses.setPermissionCheckHandler(() => true)
  ses.setDevicePermissionHandler((d) => d.deviceType === 'hid' && d.device.vendorId === SONY_VENDOR_ID)
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault()
    callback(details.deviceList.find((d) => d.vendorId === SONY_VENDOR_ID)?.deviceId)
  })
}

/**
 * Makes room for the game. Windows ignores minimize() on a fullscreen window, so leave fullscreen first
 * (bringToFront restores it).
 */
function getOutOfTheWay(w: BrowserWindow): void {
  if (!w.isFullScreen()) return w.minimize()
  w.once('leave-full-screen', () => w.minimize())
  w.setFullScreen(false)
}

/**
 * Back to the launcher after a game. Windows' focus-stealing prevention ignores focus() from a background
 * app; briefly going always-on-top is the usual way through.
 */
function bringToFront(w: BrowserWindow, fullscreen: boolean): void {
  if (w.isMinimized()) w.restore()
  w.show()
  w.setAlwaysOnTop(true, 'screen-saver')
  w.moveTop()
  w.focus()
  w.webContents.focus()
  if (fullscreen && !w.isFullScreen()) w.setFullScreen(true)
  setTimeout(() => {
    if (!w.isDestroyed()) w.setAlwaysOnTop(false)
  }, 500)
}

function createWindow(fullscreen: boolean): void {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    fullscreen,
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../resources/icon.png'),
    backgroundColor: '#05070d',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      // Keep gamepad polling / animations alive while a game is focused.
      backgroundThrottling: false
    }
  })
  grantSonyHid(win)
  win.once('ready-to-show', () => {
    win?.show()
    // Windows sometimes ignores the constructor flag when the window starts hidden.
    if (fullscreen) win?.setFullScreen(true)
  })
  win.on('closed', () => (win = null))
  if (process.env.GL_SNAPSHOT) runDevSnapshot(win, process.env.GL_SNAPSHOT)

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  protocol.handle('media', (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname.slice(1))
    return net.fetch(pathToFileURL(path).toString())
  })

  const settings = loadSettings()
  const db = openDb(join(app.getPath('userData'), 'library.db'))
  const repo = new GamesRepo(db)

  const sessions = new Map<number, number>()
  const runner = new Runner({
    onStart(game, startedAt) {
      sessions.set(game.id, repo.startSession(game.id, startedAt))
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
      if (win) {
        bringToFront(win, settings.fullscreen)
        win.webContents.send('game:ended', { gameId: game.id, seconds })
      }
    }
  })

  /**
   * Launcher over the running game (PS button / Ctrl+Shift+G), fully navigable; "Voltar ao jogo" sends
   * it back. Not drawn inside the game — exclusive-fullscreen games minimize, like Alt+Tab.
   */
  const showOverlay = () => {
    if (!win || runner.current() == null) return
    bringToFront(win, settings.fullscreen)
    win.webContents.send('overlay:state', true)
  }
  const hideOverlay = () => {
    // Also when the user Alt+Tabbed here instead of using the shortcut.
    if (!win || runner.current() == null) return
    win.webContents.send('overlay:state', false)
    getOutOfTheWay(win)
  }
  function toggleOverlay(): void {
    if (win?.isFocused() && !win.isMinimized()) hideOverlay()
    else showOverlay()
  }
  ipcMain.handle('overlay:toggle', () => toggleOverlay())
  ipcMain.handle('overlay:hide', () => hideOverlay())
  ipcMain.handle('game:stop', async (_e, gameId: number) => {
    try {
      await runner.stop(gameId)
      return { ok: true, value: null }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  registerIpc({ repo, runner, settings, getWindow: () => win })
  if (settings.openAtLogin) applyOpenAtLogin(true)
  // Started with Windows: go straight to fullscreen, console-style.
  createWindow(settings.fullscreen || process.argv.includes(AUTOSTART_ARG))

  app.on('before-quit', () => {
    globalShortcut.unregisterAll()
    runner.stopAll()
    db.close()
  })
})

app.on('window-all-closed', () => app.quit())
