import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { runDevSnapshot } from './devSnapshot'

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

export function createMainWindow(fullscreen: boolean): BrowserWindow {
  const win = new BrowserWindow({
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
    win.show()
    // Windows sometimes ignores the constructor flag when the window starts hidden.
    if (fullscreen) win.setFullScreen(true)
  })
  if (process.env.GL_SNAPSHOT) runDevSnapshot(win, process.env.GL_SNAPSHOT)

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

/**
 * Makes room for the game. Windows ignores minimize() on a fullscreen window, so leave fullscreen first
 * (bringToFront restores it).
 */
export function getOutOfTheWay(w: BrowserWindow): void {
  if (!w.isFullScreen()) return w.minimize()
  w.once('leave-full-screen', () => w.minimize())
  w.setFullScreen(false)
}

/**
 * Back to the launcher after a game. Windows' focus-stealing prevention ignores focus() from a background
 * app; briefly going always-on-top is the usual way through.
 */
export function bringToFront(w: BrowserWindow, fullscreen: boolean): void {
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
