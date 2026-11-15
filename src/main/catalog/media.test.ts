import { describe, expect, it } from 'vitest'
import { mediaQuery, toMedia } from './media'

describe('toMedia', () => {
  it('lists trailers, then screenshots, then artworks', () => {
    const media = toMedia({
      artworks: [{ image_id: 'art', width: 2880, height: 2160 }],
      screenshots: [{ image_id: 'shot', width: 1920, height: 1080 }],
      videos: [{ video_id: 'TSi0iJYSQ24', name: ' Reveal Trailer ' }]
    })
    expect(media.map((m) => m.kind)).toEqual(['video', 'image', 'image'])
    expect(media[0]).toMatchObject({ youtubeId: 'TSi0iJYSQ24', name: 'Reveal Trailer' })
    expect(media[1]).toMatchObject({ thumb: expect.stringContaining('/t_screenshot_big/shot.jpg') })
    expect(media[2]).toMatchObject({ full: expect.stringContaining('/t_1080p/art.jpg') })
  })

  it('drops non-YouTube ids and icon-sized images', () => {
    const media = toMedia({
      videos: [{ video_id: 'not a youtube id' }],
      artworks: [{ image_id: 'icon', width: 256, height: 256 }]
    })
    expect(media).toEqual([])
  })

  it('queries one game by integer id', () => {
    expect(mediaQuery(12.7)).toContain('where id = 12;')
    expect(mediaQuery(1)).toContain('videos.video_id')
  })
})
