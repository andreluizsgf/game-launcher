import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { imageUrl, type IgdbGame, type IgdbImage } from './igdb'

/** Landscape enough to fill a 16:9 screen without a bad crop. */
const MIN_WIDE_RATIO = 1.5
const area = (i: IgdbImage) => (i.width ?? 0) * (i.height ?? 0)
const isWide = (i: IgdbImage) => !!i.width && !!i.height && i.width / i.height >= MIN_WIDE_RATIO

/**
 * Background image: the biggest landscape artwork (key art), else the biggest landscape screenshot, else
 * whatever there is. IGDB's first artwork is often a portrait poster or a logo on a flat color.
 */
export function pickWide(g: Pick<IgdbGame, 'artworks' | 'screenshots'>): string | null {
  const best = (list: IgdbImage[] = []) => [...list].filter(isWide).sort((a, b) => area(b) - area(a))[0]
  return (best(g.artworks) ?? best(g.screenshots) ?? g.artworks?.[0] ?? g.screenshots?.[0])?.image_id ?? null
}

/** Downloads cover + wide artwork into `dir`, returning local paths (null when unavailable). */
export async function cacheArt(dir: string, g: IgdbGame): Promise<{ coverPath: string | null; artPath: string | null }> {
  mkdirSync(dir, { recursive: true })
  const wide = pickWide(g)
  // File names carry the image (and size), so a better pick or a sharper size downloads anew.
  const [coverPath, artPath] = await Promise.all([
    g.cover
      ? download(imageUrl(g.cover.image_id, 'cover_big_2x'), join(dir, `${g.id}-cover-${g.cover.image_id}@2x.jpg`))
      : null,
    wide ? download(imageUrl(wide, '1080p'), join(dir, `${g.id}-art-${wide}.jpg`)) : null
  ])
  return { coverPath, artPath }
}

/** Downloads `url` to `dest` once; null when it fails (no art beats a broken image). */
export async function download(url: string, dest: string): Promise<string | null> {
  if (existsSync(dest)) return dest
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
    return dest
  } catch {
    return null
  }
}
