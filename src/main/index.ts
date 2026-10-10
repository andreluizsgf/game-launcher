import { app, BrowserWindow, net, protocol } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { openDb } from './db/schema'
import { GamesRepo } from './db/games'
import { runDevSnapshot } from './devSnapshot'
import { registerIpc } from './ipc'
import { Runner } from './library/runner'
import { loadSettings } from './settings'

// Local covers are served through media://local/<encoded absolute path>
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let win: BrowserWindow | null = null

function createWindow(fullscreen: boolean): void {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    fullscreen,
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
  win.once('ready-to-show', () => win?.show())
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
      win?.minimize()
    },
    onEnd(game, startedAt, endedAt) {
      const seconds = Math.round((endedAt - startedAt) / 1000)
      const sessionId = sessions.get(game.id)
      sessions.delete(game.id)
      if (sessionId) repo.endSession(sessionId, game.id, endedAt, seconds)
      if (win) {
        win.restore()
        win.focus()
        win.webContents.send('game:ended', { gameId: game.id, seconds })
      }
    }
  })

  registerIpc({ repo, runner, settings, getWindow: () => win })
  createWindow(settings.fullscreen)

  app.on('before-quit', () => {
    runner.stopAll()
    db.close()
  })
})

app.on('window-all-closed', () => app.quit())
