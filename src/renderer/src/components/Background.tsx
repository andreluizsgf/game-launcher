import { useEffect, useState } from 'react'
import { hueOf } from '../format'

export interface BackdropArt {
  /** Stable identity; a change triggers the crossfade. */
  key: string
  url: string | null
  /** Wide artwork is shown sharp; covers are blurred. */
  wide: boolean
  /** Shown blurred instead when the "wide" image turns out not to fit a 16:9 screen (e.g. a 3:1 strip). */
  fallback?: string | null
  /** Seed for the placeholder gradient when there is no image. */
  seed: string
}

interface Layer {
  n: number
  art: BackdropArt | null
}

/** Aspect ratios a full-screen backdrop can crop to without blowing the image up: 3:2 up to ~21:9. */
const MIN_RATIO = 1.5
const MAX_RATIO = 2.4

/**
 * What a layer really shows. Store art labelled "wide" can be a 3:1 strip (Steam's library_hero) or a
 * portrait poster; both look broken cropped to 16:9, so those fall back to the blurred cover.
 */
function useFittedArt(art: BackdropArt | null): { url: string | null; wide: boolean } | 'pending' {
  const [bad, setBad] = useState<boolean | null>(art?.url && art.wide ? null : false)
  useEffect(() => {
    if (!art?.url || !art.wide) return
    let live = true
    const img = new Image()
    img.onload = () => {
      const r = img.naturalWidth / (img.naturalHeight || 1)
      if (live) setBad(r < MIN_RATIO || r > MAX_RATIO)
    }
    img.onerror = () => live && setBad(true)
    img.src = art.url
    return () => {
      live = false
    }
  }, [art?.url, art?.wide])
  if (!art?.url) return { url: null, wide: false }
  if (!art.wide) return { url: art.url, wide: false }
  if (bad === null) return 'pending'
  return bad ? { url: art.fallback ?? art.url, wide: false } : { url: art.url, wide: true }
}

function BackdropLayer({ art }: { art: BackdropArt | null }) {
  const fitted = useFittedArt(art)
  if (fitted === 'pending') return null
  const h = hueOf(art?.seed ?? '')
  // No art at all (Downloads, an empty library): a quiet blue instead of a hue picked from nothing.
  const glow = art ? `hsl(${h} 55% 22%)` : 'hsl(222 45% 15%)'
  return (
    <div
      className={`bg-layer ${fitted.url && fitted.wide ? 'wide' : ''}`}
      style={
        fitted.url
          ? { backgroundImage: `url("${fitted.url}")` }
          : { background: `radial-gradient(ellipse at 70% 30%, ${glow}, #05070d 70%)` }
      }
    />
  )
}

/** Full-screen art behind the UI, crossfading on change. */
export function Background({ art }: { art: BackdropArt | null }) {
  const [layers, setLayers] = useState<Layer[]>([{ n: 0, art }])

  useEffect(() => {
    setLayers((prev) => {
      if (prev[prev.length - 1]?.art?.key === art?.key) return prev
      const n = (prev[prev.length - 1]?.n ?? 0) + 1
      return [...prev.slice(-1), { n, art }]
    })
  }, [art])

  return (
    <div className="bg">
      {layers.map((l) => (
        <BackdropLayer key={l.n} art={l.art} />
      ))}
      <div className="bg-shade" />
    </div>
  )
}
