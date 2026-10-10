import { describe, expect, it } from 'vitest'
import { searchQuery } from './igdb'

describe('searchQuery', () => {
  it('filters to PC and strips quotes', () => {
    const q = searchQuery('Baldur"s Gate')
    expect(q).toContain('search "Baldur s Gate";')
    expect(q).toContain('platforms = (6)')
    expect(q).toContain('version_parent = null')
  })
})
