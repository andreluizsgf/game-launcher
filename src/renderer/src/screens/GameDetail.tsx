import { useState } from 'react'
import type { Game } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { GameArt } from '../components/GameArt'
import { formatDate, formatPlaytime } from '../format'
import { useInput } from '../input/useInput'
import { TelegramPanel } from '../telegram/TelegramPanel'
import { telegramMenuLabel, useTelegramThread } from '../telegram/useTelegramThread'

interface Props {
  game: Game
  running: boolean
  gamesRoot: string | null
  /** Telegram peer to query on open; null when Telegram isn't set up. */
  telegramPeer: string | null
  onLaunch(g: Game): void
  onIdentify(g: Game): void
  onRemove(g: Game): void
  onClose(): void
}

type Item = { id: 'play' | 'telegram' | 'identify' | 'remove' | 'back'; label: string; disabled?: boolean }

export function GameDetail({ game, running, gamesRoot, telegramPeer, onLaunch, onIdentify, onRemove, onClose }: Props) {
  const installed = !!game.folder
  const [tgOpen, setTgOpen] = useState(false)
  // Only message the peer once the user asks; stays on after closing the panel so replies keep arriving.
  const [tgAsked, setTgAsked] = useState(false)
  const tg = useTelegramThread(game.title, !!telegramPeer && tgAsked)
  const openTelegram = () => {
    setTgAsked(true)
    setTgOpen(true)
  }
  const items: Item[] = [
    ...(installed ? [{ id: 'play', label: running ? 'Em execução' : 'Jogar', disabled: !game.exePath || running } as Item] : []),
    ...(telegramPeer ? [{ id: 'telegram', label: telegramMenuLabel(tg.state) } as Item] : []),
    { id: 'identify', label: game.igdbId ? 'Trocar ficha' : 'Identificar jogo' },
    ...(!installed ? [{ id: 'remove', label: 'Remover da lista' } as Item] : []),
    { id: 'back', label: 'Voltar' }
  ]
  const [sel, setSel] = useState(0)

  const run = (it: Item) => {
    if (it.disabled) return
    if (it.id === 'play') onLaunch(game)
    else if (it.id === 'telegram') openTelegram()
    else if (it.id === 'identify') onIdentify(game)
    else if (it.id === 'remove') onRemove(game)
    else onClose()
  }

  useInput((a) => {
    if (a === 'back' || a === 'details') return onClose()
    if (a === 'left') setSel((s) => Math.max(0, s - 1))
    if (a === 'right') setSel((s) => Math.min(items.length - 1, s + 1))
    if (a === 'confirm') run(items[sel])
  }, !tgOpen)

  return (
    <div className="overlay">
      <div className="detail">
        <GameArt game={game} className="detail-art" />
        <div className="detail-body">
          <h1>{game.title}</h1>
          {(game.releaseYear || game.genres.length > 0) && (
            <p className="detail-sub">{[game.releaseYear, game.genres.join(', ')].filter(Boolean).join(' · ')}</p>
          )}
          {installed ? (
            <dl className="stats">
              <div>
                <dt>Tempo de jogo</dt>
                <dd>{formatPlaytime(game.totalSeconds)}</dd>
              </div>
              <div>
                <dt>Última vez</dt>
                <dd>{formatDate(game.lastPlayedAt)}</dd>
              </div>
              <div>
                <dt>Adicionado</dt>
                <dd>{formatDate(game.addedAt)}</dd>
              </div>
            </dl>
          ) : (
            <p className="detail-note">
              Não instalado. Coloque o jogo numa pasta chamada <b>{game.title.split(':')[0]}</b>
              {gamesRoot ? <> dentro de <code>{gamesRoot}</code></> : null} e ele será reconhecido no próximo
              escaneamento.
            </p>
          )}
          {game.summary && <p className="summary">{game.summary}</p>}
          {installed && (
            <p className="path" title={game.exeOverride ?? game.exePath ?? ''}>
              {game.exeOverride ?? game.exePath ?? 'Nenhum executável encontrado'}
            </p>
          )}
          <div className="menu">
            {items.map((it, i) => (
              <button
                key={it.id}
                className={`menu-item ${sel === i ? 'focused' : ''}`}
                disabled={it.disabled}
                onClick={() => {
                  setSel(i)
                  run(it)
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
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
          title={game.title}
          peer={telegramPeer}
          state={tg.state}
          onResend={tg.resend}
          onClose={() => setTgOpen(false)}
        />
      )}
    </div>
  )
}
