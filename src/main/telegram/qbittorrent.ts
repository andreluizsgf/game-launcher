import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** Usual install locations; the first one that exists wins. */
function candidates(): string[] {
  if (process.platform === 'win32') {
    const roots = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
      process.env['LOCALAPPDATA'] && join(process.env['LOCALAPPDATA'], 'Programs')
    ]
    return roots.filter((r): r is string => !!r).map((r) => join(r, 'qBittorrent', 'qbittorrent.exe'))
  }
  if (process.platform === 'darwin') {
    return ['/Applications', join(homedir(), 'Applications')].map((d) =>
      join(d, 'qbittorrent.app', 'Contents', 'MacOS', 'qbittorrent')
    )
  }
  return ['/usr/bin/qbittorrent', '/usr/local/bin/qbittorrent', '/snap/bin/qbittorrent']
}

/** A picked macOS .app bundle points at the binary inside it. */
export function resolveQbittorrent(path: string): string {
  return /\.app\/?$/i.test(path) ? join(path, 'Contents', 'MacOS', 'qbittorrent') : path
}

export function findQbittorrent(override: string | null): string | null {
  if (override) return existsSync(override) ? override : null
  return candidates().find((p) => existsSync(p)) ?? null
}

/**
 * Hands a .torrent file or magnet link to qBittorrent. A running instance receives it (the new process
 * forwards its arguments and exits); otherwise qBittorrent starts. Downloads go to `savePath` without the
 * "add torrent" dialog.
 */
export function addToQbittorrent(exe: string, torrent: string, savePath: string | null): Promise<void> {
  const args = [...(savePath ? [`--save-path=${savePath}`] : []), '--skip-dialog=true', torrent]
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
