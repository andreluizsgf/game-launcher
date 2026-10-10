import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type { Game } from '@shared/types'
import { downloadState, gameFolderOf, matchGame } from './match'

const root = join('/games')

describe('gameFolderOf', () => {
  it('uses the per-game save folder the launcher sets', () => {
    expect(
      gameFolderOf(
        { save_path: join(root, 'Control Resonant'), content_path: join(root, 'Control Resonant', 'Rel_P') },
        root
      )
    ).toBe('Control Resonant')
  })

  it('falls back to the torrent folder when saved straight into the root', () => {
    expect(gameFolderOf({ save_path: root + '/', content_path: join(root, 'Control_Resonant_P_RUS') }, root)).toBe(
      'Control_Resonant_P_RUS'
    )
  })

  it('ignores torrents outside the games folder', () => {
    expect(gameFolderOf({ save_path: '/downloads', content_path: '/downloads/x' }, root)).toBeNull()
    expect(gameFolderOf({ save_path: root, content_path: root }, root)).toBeNull()
  })
})

describe('matchGame', () => {
  const game = (id: number, title: string, folder: string | null) => ({ id, title, folder }) as Game
  const games = [game(1, 'Hades', join(root, 'Hades')), game(2, 'Control Resonant', null)]

  it('matches by folder first, then by title', () => {
    expect(matchGame('Hades', root, games)?.id).toBe(1)
    expect(matchGame('Control Resonant', root, games)?.id).toBe(2)
    expect(matchGame('Outro Jogo', root, games)).toBeNull()
  })
})

describe('downloadState', () => {
  it('maps qBittorrent states', () => {
    expect(downloadState('downloading')).toBe('downloading')
    expect(downloadState('stalledDL')).toBe('stalled')
    expect(downloadState('stoppedDL')).toBe('paused')
    expect(downloadState('uploading')).toBe('done')
    expect(downloadState('missingFiles')).toBe('error')
  })
})
