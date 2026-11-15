import { useEffect, useState } from 'react'
import type { GameMedia } from '@shared/types'

/**
 * A catalog game's gallery. `initial` (the store's screenshots) shows right away; the full list with
 * trailers replaces it when IGDB answers. Failing silently is fine: the gallery is extra.
 */
export function useGameMedia(igdbId: number | null, initial: string[] = []): GameMedia[] {
  const [media, setMedia] = useState<GameMedia[]>(() => initial.map((u) => ({ kind: 'image', thumb: u, full: u })))
  useEffect(() => {
    if (igdbId == null) return setMedia([])
    let live = true
    window.api.catalogMedia(igdbId).then((res) => {
      if (live && res.ok && res.value.length) setMedia(res.value)
    })
    return () => {
      live = false
    }
  }, [igdbId])
  return media
}
