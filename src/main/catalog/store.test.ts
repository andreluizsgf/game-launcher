import { describe, expect, it } from 'vitest'
import { sectionQueries, toStoreGame } from './store'

describe('sectionQueries', () => {
  const now = 1_790_000_000
  const q = sectionQueries(now)
  it('limits every section to main PC games with cover', () => {
    const { greatIn, ...lists } = q
    for (const body of [...Object.values(lists), greatIn('genres', 12)]) {
      expect(body).toContain('platforms = (6)')
      expect(body).toContain('version_parent = null')
      expect(body).toContain('cover != null')
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
  it('prefers artwork over screenshot for the wide art', () => {
    const g = toStoreGame(
      { id: 1, name: 'X', artworks: [{ image_id: 'art' }], screenshots: [{ image_id: 'shot' }], total_rating: 87.6 },
      null
    )
    expect(g.artUrl).toContain('/t_1080p/art.jpg')
    expect(g.rating).toBe(88)
  })
})
