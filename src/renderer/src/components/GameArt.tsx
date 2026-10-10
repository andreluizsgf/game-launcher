import type { Game } from '@shared/types'
import { hueOf, mediaUrl } from '../format'

/** Cover image, or a generated gradient with initials when the game has no art yet. */
export function GameArt({ game, className }: { game: Game; className?: string }) {
  const url = mediaUrl(game.coverPath)
  if (url) return <img className={className} src={url} alt="" draggable={false} />
  const h = hueOf(game.title)
  const initials = game.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return (
    <div
      className={`${className ?? ''} art-placeholder`}
      style={{ background: `linear-gradient(135deg, hsl(${h} 60% 32%), hsl(${(h + 50) % 360} 70% 14%))` }}
    >
      {initials}
    </div>
  )
}
