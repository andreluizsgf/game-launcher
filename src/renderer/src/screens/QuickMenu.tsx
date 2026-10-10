import { useEffect, useState } from 'react'
import type { Game } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { GameArt } from '../components/GameArt'
import { formatPlaytime } from '../format'
import { useInput } from '../input/useInput'

interface Props {
  game: Game
  startedAt: number
  onResume(): void
  onQuit(): void
}

/** In-game quick menu (PS button / Ctrl+Shift+G), shown over everything while a game runs. */
export function QuickMenu({ game, startedAt, onResume, onQuit }: Props) {
  const [sel, setSel] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const items = [
    { label: 'Voltar ao jogo', run: onResume },
    {
      label: confirming ? 'Confirmar: fechar jogo' : 'Fechar jogo',
      danger: true,
      // Second press confirms: unsaved progress is lost.
      run: () => (confirming ? onQuit() : setConfirming(true))
    }
  ]

  useInput((a) => {
    if (a === 'back') return onResume()
    if (a === 'up' || a === 'left') setSel((s) => Math.max(0, s - 1))
    if (a === 'down' || a === 'right') setSel((s) => Math.min(items.length - 1, s + 1))
    if (a === 'confirm') items[sel].run()
  })

  useEffect(() => {
    if (sel !== 1) setConfirming(false)
  }, [sel])

  return (
    <div className="overlay quick-menu-overlay">
      <div className="quick-menu">
        <GameArt game={game} className="quick-menu-art" />
        <div>
          <p className="muted">Jogando agora · {formatPlaytime(Math.round((now - startedAt) / 1000))}</p>
          <h1>{game.title}</h1>
          <div className="menu">
            {items.map((it, i) => (
              <button
                key={i}
                className={`menu-item ${sel === i ? 'focused' : ''} ${it.danger && confirming ? 'danger' : ''}`}
                onClick={() => {
                  setSel(i)
                  it.run()
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
          {confirming && <p className="detail-note">O progresso não salvo será perdido.</p>}
        </div>
      </div>
      <ButtonHints
        hints={[
          { button: '✕', label: 'Selecionar' },
          { button: '○', label: 'Voltar ao jogo' }
        ]}
      />
    </div>
  )
}
