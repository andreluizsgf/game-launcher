import { describe, expect, it } from 'vitest'
import type { IgdbGame } from './igdb'
import { pickFeatured, sampleInOrder, sectionQueries, toStoreGame } from './store'

describe('sectionQueries', () => {
  const now = 1_790_000_000
  const q = sectionQueries(now)
  it('limits every section to main PC games with cover, no adult games', () => {
    const { greatIn, ...lists } = q
    for (const body of [...Object.values(lists), greatIn('genres', 12)]) {
      expect(body).toContain('platforms = (6)')
      expect(body).toContain('version_parent = null')
      expect(body).toContain('cover != null')
      expect(body).toContain('themes != (42)')
    }
  })
  it('upcoming only lists future games by hype', () => {
    expect(q.upcoming).toContain(`first_release_date > ${now}`)
    expect(q.upcoming).toContain('sort hypes desc')
  })
})

describe('greatIn', () => {
  it('filters by the resolved genre/theme id and recent, rated games', () => {
    const body = sectionQueries(1_790_000_000).greatIn('themes', 19)
    expect(body).toContain('themes = (19)')
    expect(body).toContain('total_rating_count >= 25')
    expect(body).toContain('sort total_rating desc')
  })
})

describe('toStoreGame', () => {
  const wide = (id: string) => ({ image_id: id, width: 1920, height: 1080 })
  it('prefers artwork over screenshot for the wide art', () => {
    const g = toStoreGame(
      { id: 1, name: 'X', artworks: [wide('art')], screenshots: [wide('shot')], total_rating: 87.6 },
      null
    )
    expect(g.artUrl).toContain('/t_1080p/art.jpg')
    expect(g.rating).toBe(88)
  })
  it('skips a portrait artwork for a landscape screenshot, and has no art without one', () => {
    const poster = { image_id: 'poster', width: 2880, height: 2160 }
    expect(toStoreGame({ id: 1, name: 'X', artworks: [poster], screenshots: [wide('shot')] }, null).artUrl).toContain(
      '/shot.jpg'
    )
    expect(toStoreGame({ id: 1, name: 'X', artworks: [poster] }, null).artUrl).toBeNull()
  })
})

describe('pickFeatured', () => {
  const now = 1_790_000_000
  const art = { artworks: [{ image_id: 'a', width: 1920, height: 1080 }] }
  const g = (id: number, extra: Partial<IgdbGame>): IgdbGame => ({ id, name: `G${id}`, ...art, ...extra })
  const recent = now - 100 * 86_400

  it('keeps recent, good or hyped games with wide art, skipping evergreens and duplicates', () => {
    const picked = pickFeatured(
      [
        {
          id: 'trending',
          games: [
            g(1, { first_release_date: now - 20 * 365 * 86_400, total_rating: 90, total_rating_count: 999 }),
            g(2, { first_release_date: recent, total_rating: 85, total_rating_count: 40 }),
            g(3, { first_release_date: recent, total_rating: 60, total_rating_count: 40 }),
            g(4, { first_release_date: now + 86_400, hypes: 30 }),
            { id: 5, name: 'no art', first_release_date: recent, total_rating: 90, total_rating_count: 40 }
          ]
        },
        {
          id: 'newReleases',
          games: [g(2, { first_release_date: recent, total_rating: 85, total_rating_count: 40 })]
        },
        { id: 'rpg', games: [g(6, { first_release_date: recent, total_rating: 95, total_rating_count: 40 })] }
      ],
      now,
      () => 0
    )
    expect(picked.map((x) => x.id).sort()).toEqual([2, 4])
  })

  it('caps the banner size', () => {
    const many = Array.from({ length: 20 }, (_, i) => g(i, { first_release_date: recent, hypes: 10 }))
    expect(pickFeatured([{ id: 'upcoming', games: many }], now, Math.random, 6)).toHaveLength(6)
  })
})

describe('sampleInOrder', () => {
  it('returns n distinct items in their original order', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    const out = sampleInOrder(items, 20)
    expect(out).toHaveLength(20)
    expect([...out].sort((a, b) => a - b)).toEqual(out)
    expect(new Set(out).size).toBe(20)
  })
  it('returns everything when there are fewer than n', () => {
    expect(sampleInOrder([1, 2], 5)).toEqual([1, 2])
  })
})
