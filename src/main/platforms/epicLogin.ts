import { BrowserWindow, session } from 'electron'
import { EPIC_LOGIN_URL, REDIRECT_PAGE } from './epicAccount'

/**
 * Epic's own sign-in page in a window of its own (keyboard/mouse; the password never passes through the
 * app). When it lands on the redirect page, the authorization code is read from it and the window closes.
 * Resolves null if the window is closed first.
 */
export function epicSignIn(parent: BrowserWindow | null): Promise<string | null> {
  const ses = session.fromPartition('persist:epic-login')
  // Epic's login rejects browsers it doesn't recognize; look like plain Chrome.
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|game-launcher)\/\S+/g, ''))
  const win = new BrowserWindow({
    parent: parent ?? undefined,
    modal: !!parent,
    width: 520,
    height: 760,
    title: 'Entrar na Epic Games',
    autoHideMenuBar: true,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true }
  })
  // The launcher sits in fullscreen and on top of everything after a game; make sure this shows.
  win.setAlwaysOnTop(true, 'screen-saver')

  return new Promise((resolve) => {
    let done = false
    const finish = (code: string | null) => {
      if (done) return
      done = true
      resolve(code)
      if (!win.isDestroyed()) win.close()
    }
    win.on('closed', () => finish(null))
    win.webContents.on('did-finish-load', async () => {
      if (!win.webContents.getURL().startsWith(REDIRECT_PAGE)) return
      try {
        const text: string = await win.webContents.executeJavaScript('document.body.innerText')
        const code = (JSON.parse(text) as { authorizationCode?: string | null }).authorizationCode
        if (code) finish(code)
      } catch {
        // Not the JSON page yet.
      }
    })
    win.loadURL(EPIC_LOGIN_URL)
  })
}
