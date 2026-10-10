import { useState } from 'react'
import type { StoreGame } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { formatReleaseDate, ratingTone } from '../format'
import { useInput } from '../input/useInput'
import { TelegramPanel } from '../telegram/TelegramPanel'
import { telegramMenuLabel, useTelegramThread } from '../telegram/useTelegramThread'

interface Props {
  game: StoreGame
  /** Telegram peer to query on open; null when Telegram isn't set up. */
  telegramPeer: string | null
  onAdd(g: StoreGame): Promise<void>
  onShowInLibrary(gameId: number): void
  onClose(): void
}

export function StoreDetail({ game, telegramPeer, onAdd, onShowInLibrary, onClose }: Props) {
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState(false)
  const [tgOpen, setTgOpen] = useState(false)
  // Only message the peer once the user asks; stays on after closing the panel so replies keep arriving.
  const [tgAsked, setTgAsked] = useState(false)
  // igdbId: downloading from here adds the game to the library.
  const tg = useTelegramThread(game.name, !!telegramPeer && tgAsked, game.igdbId)
  const openTelegram = () => {
    setTgAsked(true)
    setTgOpen(true)
  }
  const upcoming = !!game.releaseDate && game.releaseDate > Date.now()
  const items = [
    game.inLibraryId
      ? { label: 'Ver na biblioteca', run: () => onShowInLibrary(game.inLibraryId!) }
      : {
          label: busy ? 'Adicionando…' : upcoming ? 'Adicionar à lista de desejos' : 'Adicionar à lista',
          run: async () => {
            if (busy) return
            setBusy(true)
            await onAdd(game)
            setBusy(false)
          }
        },
    ...(telegramPeer ? [{ label: telegramMenuLabel(tg.state), run: openTelegram }] : []),
    { label: 'Voltar', run: onClose }
  ]

  useInput((a) => {
    if (a === 'back') return onClose()
    if (a === 'left') setSel((s) => Math.max(0, s - 1))
    if (a === 'right') setSel((s) => Math.min(items.length - 1, s + 1))
    if (a === 'confirm') items[sel].run()
  }, !tgOpen)

  return (
    <div className="overlay store-detail-overlay">
      {game.artUrl && <div className="store-detail-art" style={{ backgroundImage: `url("${game.artUrl}")` }} />}
      <div className="store-detail">
        {game.coverUrl && <img className="store-detail-cover" src={game.coverUrl} alt="" draggable={false} />}
        <div className="detail-body">
          <h1>{game.name}</h1>
          <p className="store-hero-meta">
            {game.rating != null && <span className={`rating ${ratingTone(game.rating)}`}>{game.rating}</span>}
            {[formatReleaseDate(game.releaseDate), game.genres.join(', ')].filter(Boolean).join(' · ')}
            {game.ratingCount > 0 && <span className="muted"> · {game.ratingCount} avaliações</span>}
          </p>
          {game.summary && <p className="summary">{game.summary}</p>}
          <div className="menu">
            {items.map((it, i) => (
              <button
                key={i}
                className={`menu-item ${sel === i ? 'focused' : ''}`}
                onClick={() => {
                  setSel(i)
                  it.run()
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
          {game.screenshots.length > 0 && (
            <div className="shots">
              {game.screenshots.slice(0, 4).map((u) => (
                <img key={u} src={u} alt="" draggable={false} loading="lazy" />
              ))}
            </div>
          )}
        </div>
      </div>
      <ButtonHints
        hints={[
          { button: '✕', label: 'Selecionar' },
          { button: '○', label: 'Voltar' }
        ]}
      />
      {tgOpen && (
        <TelegramPanel
          title={game.name}
          peer={telegramPeer}
          state={tg.state}
          onResend={tg.resend}
          onClose={() => setTgOpen(false)}
        />
      )}
    </div>
  )
}
