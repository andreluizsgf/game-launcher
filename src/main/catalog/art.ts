import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { imageUrl, type IgdbGame } from './igdb'

/** Downloads cover + wide artwork into `dir`, returning local paths (null when unavailable). */
export async function cacheArt(dir: string, g: IgdbGame): Promise<{ coverPath: string | null; artPath: string | null }> {
  mkdirSync(dir, { recursive: true })
  const wide = g.artworks?.[0]?.image_id ?? g.screenshots?.[0]?.image_id
  const [coverPath, artPath] = await Promise.all([
    g.cover ? download(imageUrl(g.cover.image_id, 'cover_big'), join(dir, `${g.id}-cover.jpg`)) : null,
    wide ? download(imageUrl(wide, '1080p'), join(dir, `${g.id}-art.jpg`)) : null
  ])
  return { coverPath, artPath }
}

async function download(url: string, dest: string): Promise<string | null> {
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
