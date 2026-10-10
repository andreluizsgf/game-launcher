import { useEffect, useState } from 'react'
import type { DownloadInfo, Game, GameAchievements } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { GameArt } from '../components/GameArt'
import { formatDate, formatDownload, formatPlaytime } from '../format'
import { useInput } from '../input/useInput'
import { Achievements } from './Achievements'
import { TelegramPanel } from '../telegram/TelegramPanel'
import { telegramMenuLabel, useTelegramThread } from '../telegram/useTelegramThread'

interface Props {
  game: Game
  running: boolean
  /** Active download of this game, if any. */
  download: DownloadInfo | null
  gamesRoot: string | null
  /** Telegram peer to query on open; null when Telegram isn't set up. */
  telegramPeer: string | null
  onLaunch(g: Game): void
  onResume(): void
  /** Force-closes the running game. */
  onStop(g: Game): void
  /** Moves the game folder to the Recycle Bin. */
  onUninstall(g: Game): void
  onIdentify(g: Game): void
  onRemove(g: Game): void
  onClose(): void
}

type Item = {
  id: 'play' | 'resume' | 'stop' | 'achievements' | 'telegram' | 'identify' | 'uninstall' | 'remove' | 'back'
  label: string
  disabled?: boolean
  danger?: boolean
}

export function GameDetail(props: Props) {
  const { game, running, download, gamesRoot, telegramPeer, onLaunch, onResume, onStop, onUninstall } = props
  const { onIdentify, onRemove, onClose } = props
  // Destructive items need a second press.
  const [confirm, setConfirm] = useState<'stop' | 'uninstall' | null>(null)
  const [achievements, setAchievements] = useState<GameAchievements | null>(null)
  const [achOpen, setAchOpen] = useState(false)
  useEffect(() => {
    window.api.achievements(game.id).then(setAchievements)
  }, [game.id])
  // A folder that's still downloading isn't playable yet.
  const installed = !!game.folder && !download
  const [tgOpen, setTgOpen] = useState(false)
  // Only message the peer once the user asks; stays on after closing the panel so replies keep arriving.
  const [tgAsked, setTgAsked] = useState(false)
  const tg = useTelegramThread(game.title, !!telegramPeer && tgAsked, game.igdbId)
  const openTelegram = () => {
    setTgAsked(true)
    setTgOpen(true)
  }
  const items: Item[] = [
    ...(running
      ? [
          { id: 'resume', label: 'Voltar ao jogo' } as Item,
          {
            id: 'stop',
            label: confirm === 'stop' ? 'Confirmar: fechar jogo' : 'Fechar jogo',
            danger: confirm === 'stop'
          } as Item
        ]
      : installed
        ? [{ id: 'play', label: 'Jogar', disabled: !game.exePath } as Item]
        : []),
    ...(achievements
      ? [{ id: 'achievements', label: `Conquistas · ${achievements.unlocked}/${achievements.total}` } as Item]
      : []),
    ...(telegramPeer ? [{ id: 'telegram', label: telegramMenuLabel(tg.state) } as Item] : []),
    { id: 'identify', label: game.igdbId ? 'Trocar ficha' : 'Identificar jogo' },
    ...(game.folder && !running
      ? [
          {
            id: 'uninstall',
            label:
              confirm === 'uninstall'
                ? 'Confirmar: desinstalar'
                : download
                  ? 'Cancelar download'
                  : 'Desinstalar',
            danger: confirm === 'uninstall'
          } as Item
        ]
      : []),
    ...(!game.folder ? [{ id: 'remove', label: 'Remover da lista' } as Item] : []),
    { id: 'back', label: 'Voltar' }
  ]
  const [sel, setSel] = useState(0)

  const run = (it: Item) => {
    if (it.disabled) return
    if (it.id === 'play') onLaunch(game)
    else if (it.id === 'resume') onResume()
    else if (it.id === 'stop' || it.id === 'uninstall') {
      if (confirm !== it.id) return setConfirm(it.id)
      setConfirm(null)
      if (it.id === 'stop') onStop(game)
      else onUninstall(game)
    }
    else if (it.id === 'telegram') openTelegram()
    else if (it.id === 'achievements') setAchOpen(true)
    else if (it.id === 'identify') onIdentify(game)
    else if (it.id === 'remove') onRemove(game)
    else onClose()
  }

  useInput((a) => {
    if (a === 'back' || a === 'details') return onClose()
    if (a === 'left' || a === 'right') setConfirm(null)
    if (a === 'left') setSel((s) => Math.max(0, s - 1))
    if (a === 'right') setSel((s) => Math.min(items.length - 1, s + 1))
    if (a === 'confirm') run(items[sel])
  }, !tgOpen && !achOpen)

  return (
    <div className="overlay">
      <div className="detail">
        <GameArt game={game} className="detail-art" />
        <div className="detail-body">
          <h1>{game.title}</h1>
          {(game.releaseYear || game.genres.length > 0) && (
            <p className="detail-sub">{[game.releaseYear, game.genres.join(', ')].filter(Boolean).join(' · ')}</p>
          )}
          {download ? (
            <div className="detail-download">
              <p className="detail-note">{formatDownload(download)}</p>
              <div className="progress">
                <span style={{ width: `${download.progress * 100}%` }} />
              </div>
            </div>
          ) : installed ? (
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
          {confirm === 'stop' && <p className="detail-note">O progresso não salvo será perdido.</p>}
          {confirm === 'uninstall' && (
            <p className="detail-note">
              A pasta vai pra Lixeira (dá pra restaurar de lá).{' '}
              {game.igdbId ? 'O jogo continua na biblioteca.' : 'O jogo sai da biblioteca.'}
            </p>
          )}
          {installed && (
            <p className="path" title={game.exeOverride ?? game.exePath ?? ''}>
              {game.exeOverride ?? game.exePath ?? 'Nenhum executável encontrado'}
            </p>
          )}
          <div className="menu">
            {items.map((it, i) => (
              <button
                key={it.id}
                className={`menu-item ${sel === i ? 'focused' : ''} ${it.danger ? 'danger' : ''}`}
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
      {achOpen && achievements && (
        <Achievements title={game.title} data={achievements} onClose={() => setAchOpen(false)} />
      )}
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
