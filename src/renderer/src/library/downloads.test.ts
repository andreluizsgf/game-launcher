import { describe, expect, it } from 'vitest'
import type { DownloadInfo } from '@shared/types'
import { downloadsSummary, sortDownloads } from './downloads'

const dl = (title: string, state: DownloadInfo['state'], progress: number, size: number): DownloadInfo => ({
  hash: title,
  gameId: null,
  title,
  progress,
  state,
  speed: 0,
  eta: null,
  size
})

describe('downloadsSummary', () => {
  it('counts unfinished downloads, including ones not matched to a library game', () => {
    const s = downloadsSummary([dl('A', 'downloading', 0.5, 100), dl('B', 'paused', 0, 100), dl('C', 'done', 1, 50)])
    expect(s.active).toBe(2)
    expect(s.progress).toBeCloseTo(0.25)
  })

  it('weighs progress by size', () => {
    expect(downloadsSummary([dl('Big', 'downloading', 0.1, 900), dl('Patch', 'downloading', 1, 100)]).progress)
      .toBeCloseTo(0.19)
  })

  it('averages when sizes are unknown yet (magnet fetching metadata) and is 0 with nothing active', () => {
    expect(downloadsSummary([dl('A', 'queued', 0.2, 0), dl('B', 'queued', 0.4, 0)]).progress).toBeCloseTo(0.3)
    expect(downloadsSummary([dl('C', 'done', 1, 50)])).toEqual({ active: 0, progress: 0 })
  })
})

describe('sortDownloads', () => {
  it('puts moving downloads first and finished ones last', () => {
    const order = sortDownloads([
      dl('Done', 'done', 1, 1),
      dl('Paused', 'paused', 0.3, 1),
      dl('Zeta', 'downloading', 0.1, 1),
      dl('Alpha', 'downloading', 0.2, 1)
    ]).map((d) => d.title)
    expect(order).toEqual(['Alpha', 'Zeta', 'Paused', 'Done'])
  })
})
