import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Dev-only visual check: `GL_SNAPSHOT=<dir>` captures the window after a scripted
 * sequence of key presses, then quits. Keys use the keyboard fallback mapping.
 */
export function runDevSnapshot(win: BrowserWindow, dir: string): void {
  const steps: Array<{ keys: string[]; name: string; click?: { x: number; y: number } }> = [
    { keys: [], name: '1-home' },
    { keys: ['Right', 'Right', 'Right'], name: '2-focus-moved' },
    { keys: ['t'], name: '3-detail' },
    { keys: ['Escape', 'o'], name: '4-settings' },
    { keys: ['Escape', 's', 'h', 'a', 'd', 'e', 's', 'Down', 'Right', 'Right'], name: '5-search' },
    { keys: ['Escape', 'Escape', 'e'], name: '6-store' },
    { keys: ['Down', 'Right', 'Right'], name: '7-store-row' },
    { keys: ['Enter'], name: '8-store-detail' },
    { keys: ['Escape'], name: '9-click-games-tab', click: { x: 150, y: 42 } }
  ]
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  win.webContents.once('did-finish-load', async () => {
    await wait(1500)
    for (const step of steps) {
      for (const key of step.keys) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
        await wait(150)
      }
      if (step.click) {
        const { x, y } = step.click
        win.webContents.sendInputEvent({ type: 'mouseMove', x: x - 20, y })
        win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
        win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
        win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
      }
      await wait(900)
      const img = await win.webContents.capturePage()
      writeFileSync(join(dir, `${step.name}.png`), img.toPNG())
    }
    app.quit()
  })
}
