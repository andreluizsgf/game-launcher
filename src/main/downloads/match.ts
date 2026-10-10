import { relative, sep } from 'path'
import type { DownloadState, Game } from '@shared/types'
import { titlesMatch } from '@shared/titleKey'
import { titleFromFolder } from '../library/exePicker'
import type { QbTorrent } from './qbWebApi'

/**
 * Which direct subfolder of the games root a torrent writes into, or null when it's not
 * downloading into the games root. Torrents added by the launcher save into `<root>/<title>`;
 * older ones were saved straight into the root, where their own folder is the game folder.
 */
export function gameFolderOf(t: Pick<QbTorrent, 'save_path' | 'content_path'>, root: string): string | null {
  const norm = (p: string) => p.replace(/[\\/]+/g, sep).replace(/[\\/]+$/, '')
  const r = norm(root)
  const save = norm(t.save_path)
  const target = save.toLowerCase() === r.toLowerCase() ? norm(t.content_path) : save
  const rel = relative(r, target)
  if (!rel || rel.startsWith('..') || /^[a-z]:/i.test(rel) || rel.startsWith(sep)) return null
  return rel.split(sep)[0]
}

/** The library game a torrent's folder belongs to: same folder, else a title match. */
export function matchGame(folderName: string, root: string, games: Game[]): Game | null {
  const lower = (p: string) => p.toLowerCase().replace(/[\\/]+$/, '')
  const folder = lower(`${root}${sep}${folderName}`)
  return (
    games.find((g) => g.folder && lower(g.folder) === folder) ??
    games.find((g) => titlesMatch(g.title, titleFromFolder(folderName))) ??
    null
  )
}

/** qBittorrent states → what the launcher shows. */
export function downloadState(qbState: string): DownloadState {
  switch (qbState) {
    case 'downloading':
    case 'forcedDL':
    case 'metaDL':
    case 'forcedMetaDL':
    case 'allocating':
      return 'downloading'
    case 'stalledDL':
      return 'stalled'
    case 'pausedDL':
    case 'stoppedDL':
      return 'paused'
    case 'queuedDL':
    case 'checkingDL':
    case 'checkingResumeData':
    case 'moving':
      return 'queued'
    case 'error':
    case 'missingFiles':
      return 'error'
    default:
      // uploading, stalledUP, pausedUP/stoppedUP, queuedUP, forcedUP, checkingUP…
      return 'done'
  }
}
