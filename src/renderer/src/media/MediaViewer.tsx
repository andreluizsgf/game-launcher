import { useRef, useState } from 'react'
import type { GameMedia } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { useInput } from '../input/useInput'

interface Props {
  media: GameMedia[]
  start: number
  title: string
  onClose(): void
}

/**
 * Full-screen gallery: ←/→ (or L1/R1) browse, ○ closes, ✕ pauses/plays a trailer. The YouTube frame
 * ignores the mouse so focus (and the keyboard) stays with the launcher; it's driven through the
 * IFrame API's postMessage commands instead.
 */
export function MediaViewer({ media, start, title, onClose }: Props) {
  const [i, setI] = useState(start)
  const [paused, setPaused] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const item = media[i]

  const go = (dir: -1 | 1) => {
    setI((n) => (n + dir + media.length) % media.length)
    setPaused(false)
  }
  const togglePlay = () => {
    const func = paused ? 'playVideo' : 'pauseVideo'
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*')
    setPaused(!paused)
  }

  useInput((a) => {
    if (a === 'back' || a === 'details') onClose()
    else if (a === 'left' || a === 'pageLeft') go(-1)
    else if (a === 'right' || a === 'pageRight') go(1)
    else if (a === 'confirm' && item?.kind === 'video') togglePlay()
  }, true)

  if (!item) return null
  return (
    <div className="overlay top media-viewer" onClick={onClose}>
      <div className="media-stage" onClick={(e) => e.stopPropagation()}>
        {item.kind === 'video' ? (
          <iframe
            ref={frame}
            key={item.youtubeId}
            className="media-video"
            src={`https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`}
            title={item.name ?? title}
            allow="autoplay; encrypted-media; fullscreen"
          />
        ) : (
          <img key={item.full} className="media-image" src={item.full} alt="" draggable={false} />
        )}
        {media.length > 1 && (
          <>
            <button className="media-nav prev" onClick={() => go(-1)} aria-label="Anterior" />
            <button className="media-nav next" onClick={() => go(1)} aria-label="Próxima" />
          </>
        )}
      </div>
      <p className="media-caption">
        {title}
        {item.kind === 'video' && item.name ? ` · ${item.name}` : ''}
        <span className="muted">
          {' '}
          · {i + 1} / {media.length}
        </span>
      </p>
      <ButtonHints
        hints={[
          ...(item.kind === 'video' ? [{ button: '✕' as const, label: paused ? 'Continuar' : 'Pausar' }] : []),
          { button: '○', label: 'Fechar' }
        ]}
      />
    </div>
  )
}
