import { useEffect, useRef } from 'react'
import type { GameMedia } from '@shared/types'

interface Props {
  media: GameMedia[]
  /** Focused thumbnail while the strip has focus; null = focus is elsewhere. */
  focused: number | null
  onOpen(index: number): void
}

/** Row of gallery thumbnails under a game's details; trailers carry a play badge. */
export function MediaStrip({ media, focused, onOpen }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focused == null) return
    const el = ref.current?.children[focused] as HTMLElement | undefined
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [focused])
  if (!media.length) return null
  return (
    <div className="media-strip" ref={ref}>
      {media.map((m, i) => (
        <button
          key={m.kind === 'video' ? m.youtubeId : m.full}
          className={`media-thumb ${focused === i ? 'focused' : ''}`}
          onClick={() => onOpen(i)}
        >
          <img src={m.thumb} alt="" draggable={false} loading="lazy" />
          {m.kind === 'video' && <span className="media-play" aria-label="Vídeo" />}
        </button>
      ))}
    </div>
  )
}
