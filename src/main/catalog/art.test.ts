import { describe, expect, it } from 'vitest'
import { hasWideArt, pickWide } from './art'

describe('pickWide', () => {
  it('prefers the biggest landscape artwork over portrait posters and screenshots', () => {
    const id = pickWide({
      artworks: [
        { image_id: 'poster', width: 1000, height: 1500 },
        { image_id: 'small', width: 1280, height: 720 },
        { image_id: 'big', width: 3840, height: 2160 }
      ],
      screenshots: [{ image_id: 'shot', width: 1920, height: 1080 }]
    })
    expect(id).toBe('big')
  })

  it('falls back to a landscape screenshot, then to anything', () => {
    const shots = [{ image_id: 'shot', width: 1920, height: 1080 }]
    expect(pickWide({ artworks: [{ image_id: 'poster', width: 600, height: 900 }], screenshots: shots })).toBe('shot')
    expect(pickWide({ artworks: [{ image_id: 'nosize' }] })).toBe('nosize')
    expect(pickWide({})).toBeNull()
  })
})

describe('hasWideArt', () => {
  it('needs a landscape artwork or screenshot, not just a poster', () => {
    expect(hasWideArt({ artworks: [{ image_id: 'poster', width: 600, height: 900 }] })).toBe(false)
    expect(hasWideArt({ artworks: [{ image_id: 'nosize' }] })).toBe(false)
    expect(hasWideArt({ screenshots: [{ image_id: 'shot', width: 1920, height: 1080 }] })).toBe(true)
  })
})
