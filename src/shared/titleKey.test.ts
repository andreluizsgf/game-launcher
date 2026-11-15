import { describe, expect, it } from 'vitest'
import { titlesMatch } from './titleKey'

describe('titlesMatch', () => {
  it('matches folder title against full catalog name', () => {
    expect(titlesMatch('The Witcher 3', 'The Witcher 3: Wild Hunt')).toBe(true)
    expect(titlesMatch('Hollow Knight', 'Hollow Knight')).toBe(true)
    expect(titlesMatch('Ori and the Will of the Wisps', 'Ori and the Will of the Wisps')).toBe(true)
    expect(titlesMatch('Pokemon', 'Pokémon')).toBe(true)
  })
  it('ignores trademark signs (store names carry them, IGDB does not)', () => {
    expect(titlesMatch('EA SPORTS FC™ 26', 'EA Sports FC 26')).toBe(true)
    expect(titlesMatch('Tom Clancy’s Rainbow Six® Siege', "Tom Clancy's Rainbow Six Siege")).toBe(true)
  })
  it('does not match sequels', () => {
    expect(titlesMatch('Hades', 'Hades II')).toBe(false)
    expect(titlesMatch('Celeste', 'Celeste 64: Fragments of the Mountain')).toBe(false)
  })
})
