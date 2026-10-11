import { app, net, protocol, type BrowserWindow } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { GamesRepo } from './db/games'
import { openDb } from './db/schema'
import { registerIpc } from './ipc'
import { createGameSessions, releaseShortcuts } from './sessions'
import { applyOpenAtLogin, AUTOSTART_ARG, loadSettings } from './settings'
import { createMainWindow } from './window'

// Local covers are served through media://local/<encoded absolute path>
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let win: BrowserWindow | null = null
const getWindow = () => win

app.whenReady().then(async () => {
  protocol.handle('media', (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname.slice(1))
    return net.fetch(pathToFileURL(path).toString())
  })

  const settings = loadSettings()
  const db = openDb(join(app.getPath('userData'), 'library.db'))
  const repo = new GamesRepo(db)
  const runner = createGameSessions(repo, settings, getWindow)

  registerIpc({ repo, runner, settings, getWindow })
  if (settings.openAtLogin) applyOpenAtLogin(true)
  // Started with Windows: go straight to fullscreen, console-style.
  win = createMainWindow(settings.fullscreen || process.argv.includes(AUTOSTART_ARG))
  win.on('closed', () => (win = null))

  app.on('before-quit', () => {
    releaseShortcuts()
    runner.stopAll()
    db.close()
  })
})

app.on('window-all-closed', () => app.quit())
