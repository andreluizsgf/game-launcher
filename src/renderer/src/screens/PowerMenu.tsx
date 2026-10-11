import { useState } from 'react'
import { ButtonHints } from '../components/ButtonHints'
import { useInput } from '../input/useInput'

type Action = 'sleep' | 'restart' | 'shutdown'

interface Props {
  /** A game is running: restart/shutdown close it without saving. */
  gameRunning: boolean
  onPower(action: Action): void
  onClose(): void
}

const ITEMS: { id: Action | 'cancel'; label: string; icon: string }[] = [
  { id: 'sleep', label: 'Suspender', icon: '☾' },
  { id: 'restart', label: 'Reiniciar', icon: '↻' },
  { id: 'shutdown', label: 'Desligar', icon: '⏻' },
  { id: 'cancel', label: 'Cancelar', icon: '✕' }
]

/** Power options (PS button on Home, or Settings → Energia). Starts on the least destructive one. */
export function PowerMenu({ gameRunning, onPower, onClose }: Props) {
  const [sel, setSel] = useState(0)
  const run = (i: number) => {
    const id = ITEMS[i].id
    if (id === 'cancel') onClose()
    else onPower(id)
  }

  useInput((a) => {
    if (a === 'back') return onClose()
    if (a === 'left' || a === 'up') setSel((s) => Math.max(0, s - 1))
    if (a === 'right' || a === 'down') setSel((s) => Math.min(ITEMS.length - 1, s + 1))
    if (a === 'confirm') run(sel)
  })

  return (
    <div className="overlay top">
      <div className="power-menu">
        <h2>Energia</h2>
        <div className="power-items">
          {ITEMS.map((it, i) => (
            <button
              key={it.id}
              className={`power-item ${i === sel ? 'focused' : ''}`}
              onClick={() => {
                setSel(i)
                run(i)
              }}
            >
              <span className="power-icon">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
        {gameRunning && (
          <p className="detail-note">Há um jogo aberto: reiniciar ou desligar fecha ele sem salvar.</p>
        )}
      </div>
      <ButtonHints
        hints={[
          { button: '✕', label: 'Selecionar' },
          { button: '○', label: 'Voltar' }
        ]}
      />
    </div>
  )
}
