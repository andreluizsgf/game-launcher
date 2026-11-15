import type { GameMedia } from '@shared/types'
import { imageUrl, type IgdbImage } from './igdb'

export interface IgdbMediaGame {
  screenshots?: IgdbImage[]
  artworks?: IgdbImage[]
  videos?: { video_id: string; name?: string }[]
}

/** Apicalypse body for one game's gallery. Exported for tests. */
export const mediaQuery = (igdbId: number) =>
  `fields screenshots.image_id,screenshots.width,screenshots.height,artworks.image_id,artworks.width,` +
  `artworks.height,videos.video_id,videos.name; where id = ${Math.trunc(igdbId)};`

/** IGDB stores YouTube ids; anything else can't be embedded. */
const YOUTUBE_ID = /^[\w-]{11}$/

/**
 * Trailers first (what people open the gallery for), then screenshots, then artworks. Artworks
 * include posters and logos, so they go last; tiny images (icons) are left out.
 */
export function toMedia(g: IgdbMediaGame): GameMedia[] {
  const videos: GameMedia[] = (g.videos ?? [])
    .filter((v) => YOUTUBE_ID.test(v.video_id))
    .map((v) => ({
      kind: 'video',
      youtubeId: v.video_id,
      name: v.name?.trim() || null,
      thumb: `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`
    }))
  const image = (i: IgdbImage): GameMedia => ({
    kind: 'image',
    thumb: imageUrl(i.image_id, 'screenshot_big'),
    full: imageUrl(i.image_id, '1080p')
  })
  const bigEnough = (i: IgdbImage) => !i.width || i.width >= 640
  const images = [...(g.screenshots ?? []), ...(g.artworks ?? [])].filter(bigEnough).map(image)
  return [...videos, ...images]
}
