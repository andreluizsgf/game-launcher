import { useEffect, useState } from 'react'
import { hueOf } from '../format'

export interface BackdropArt {
  /** Stable identity; a change triggers the crossfade. */
  key: string
  url: string | null
  /** Wide artwork is shown sharp; covers are blurred. */
  wide: boolean
  /** Seed for the placeholder gradient when there is no image. */
  seed: string
}

interface Layer {
  n: number
  art: BackdropArt | null
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
      {layers.map((l) => {
        const h = hueOf(l.art?.seed ?? '')
        // No art at all (Downloads, an empty library): a quiet blue instead of a hue picked from nothing.
        const glow = l.art ? `hsl(${h} 55% 22%)` : 'hsl(222 45% 15%)'
        return (
          <div
            key={l.n}
            className={`bg-layer ${l.art?.url && l.art.wide ? 'wide' : ''}`}
            style={
              l.art?.url
                ? { backgroundImage: `url("${l.art.url}")` }
                : { background: `radial-gradient(ellipse at 70% 30%, ${glow}, #05070d 70%)` }
            }
          />
        )
      })}
      <div className="bg-shade" />
    </div>
  )
}
