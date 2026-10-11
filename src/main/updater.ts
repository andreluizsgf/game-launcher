import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

/** Public repo holding only the installers (the code repo is private). */
export const RELEASES_REPO = { owner: 'andreluizsgf', repo: 'game-launcher-releases' }

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

/** The portable build can't update itself (it runs from a temp copy); it only learns about new versions. */
export const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE

/** Newer than the running version? Plain x.y.z comparison. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0)
  const [a, b] = [parse(latest), parse(current)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

/**
 * Installed build: electron-updater checks the releases repo, downloads in the background (only the
 * changed blocks) and installs on restart — or on quit, if the user never restarts.
 * Portable build: asks GitHub for the latest release and offers the installer.
 */
export class Updater {
  private state: UpdateState = { status: 'idle', version: null, percent: 0 }

  constructor(private emit: (s: UpdateState) => void) {}

  current(): UpdateState {
    return this.state
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.state)
  }

  start(): void {
    if (!app.isPackaged) return
    if (isPortable()) {
      this.checkPortable()
      setInterval(() => this.checkPortable(), CHECK_EVERY_MS)
      return
    }
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-available', (i) => this.set({ status: 'downloading', version: i.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', percent: p.percent / 100 }))
    autoUpdater.on('update-downloaded', (i) => this.set({ status: 'ready', version: i.version, percent: 1 }))
    autoUpdater.on('error', () => {
      // Offline or GitHub hiccup: keep whatever we knew and try again later.
      if (this.state.status === 'downloading') this.set({ status: 'idle' })
    })
    const check = () => autoUpdater.checkForUpdates().catch(() => {})
    check()
    setInterval(check, CHECK_EVERY_MS)
  }

  private async checkPortable(): Promise<void> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${RELEASES_REPO.owner}/${RELEASES_REPO.repo}/releases/latest`,
        {
          headers: { Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(10000)
        }
      )
      if (!res.ok) return
      const { tag_name } = (await res.json()) as { tag_name: string }
      if (isNewer(tag_name, app.getVersion())) this.set({ status: 'portable', version: tag_name.replace(/^v/, '') })
    } catch {
      // Try again on the next interval.
    }
  }

  /** Restarts into the downloaded version (installer runs silently). */
  install(): void {
    if (this.state.status === 'ready') autoUpdater.quitAndInstall(true, true)
  }
}
