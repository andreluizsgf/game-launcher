import { useEffect, useRef, useState } from 'react'
import { EMULATOR_NAME, systemById } from '@shared/systems'
import type { DownloadInfo, EmulatorAction, Game, GameAchievements } from '@shared/types'
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
  /** Its installer is open. */
  installing: boolean
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
  /** Runs the repack's setup.exe. */
  onInstall(g: Game): void
  /** Deletes the repack files after installing. */
  onCleanInstaller(g: Game): void
  /** Owned on Steam/Epic, not installed: the store's install dialog. */
  onStoreInstall(g: Game): void
  /** Running in RetroArch: save/load state, fast-forward. */
  onEmulatorAction(g: Game, action: EmulatorAction): void
  onIdentify(g: Game): void
  onRemove(g: Game): void
  onClose(): void
}

type Item = {
  id:
    | 'play'
    | 'install'
    | 'cleanInstaller'
    | 'storeInstall'
    | 'resume'
    | EmulatorAction
    | 'stop'
    | 'achievements'
    | 'telegram'
    | 'identify'
    | 'uninstall'
    | 'remove'
    | 'back'
  label: string
  disabled?: boolean
  danger?: boolean
}

export function GameDetail(props: Props) {
  const { game, running, installing, download, gamesRoot, telegramPeer, onLaunch, onResume, onStop } = props
  const { onUninstall, onInstall, onCleanInstaller, onStoreInstall, onEmulatorAction, onIdentify, onRemove, onClose } =
    props
  // Destructive items need a second press.
  const [confirm, setConfirm] = useState<'stop' | 'uninstall' | 'cleanInstaller' | null>(null)
  const [achievements, setAchievements] = useState<GameAchievements | null>(null)
  const [achOpen, setAchOpen] = useState(false)
  useEffect(() => {
    window.api.achievements(game.id).then(setAchievements)
  }, [game.id])
  // A folder that's still downloading isn't playable yet.
  const installed = !!game.folder && !download
  const playable = !!(game.exePath || game.launchUri)
  // A repack: the download is a setup.exe that still has to be run.
  const needsInstall = installed && !playable && !!game.installerPath
  // In the Steam/Epic account but not on this PC.
  const store = game.source === 'steam' ? 'Steam' : game.source === 'epic' ? 'Epic Games' : null
  const storeOwned = !game.folder && !!store
  const emulated = game.source === 'emulator' ? systemById(game.platform) : null
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
          ...(emulated?.emulator === 'retroarch'
            ? ([
                { id: 'saveState', label: 'Salvar estado' },
                { id: 'loadState', label: 'Carregar estado' },
                { id: 'fastForward', label: 'Acelerar · liga/desliga' }
              ] as Item[])
            : []),
          {
            id: 'stop',
            label: confirm === 'stop' ? 'Confirmar: fechar jogo' : 'Fechar jogo',
            danger: confirm === 'stop'
          } as Item
        ]
      : needsInstall
        ? [{ id: 'install', label: installing ? 'Instalando…' : 'Instalar', disabled: installing } as Item]
        : installed
          ? [{ id: 'play', label: 'Jogar', disabled: !playable } as Item]
          : storeOwned
            ? [{ id: 'storeInstall', label: `Instalar na ${store}` } as Item]
            : []),
    ...(achievements
      ? [{ id: 'achievements', label: `Conquistas · ${achievements.unlocked}/${achievements.total}` } as Item]
      : []),
    ...(telegramPeer ? [{ id: 'telegram', label: telegramMenuLabel(tg.state) } as Item] : []),
    { id: 'identify', label: game.igdbId ? 'Trocar ficha' : 'Identificar jogo' },
    // Epic has no uninstall link; the launcher's own library does it.
    ...(game.folder && !running && game.source !== 'epic' && game.source !== 'emulator'
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
    ...(installed && playable && game.installerPath && !running
      ? [
          {
            id: 'cleanInstaller',
            label: confirm === 'cleanInstaller' ? 'Confirmar: apagar instalador' : 'Apagar instalador',
            danger: confirm === 'cleanInstaller'
          } as Item
        ]
      : []),
    ...(!game.folder && !storeOwned ? [{ id: 'remove', label: 'Remover da lista' } as Item] : []),
    { id: 'back', label: 'Voltar' }
  ]
  const [sel, setSel] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const run = (it: Item) => {
    if (it.disabled) return
    if (it.id === 'play') onLaunch(game)
    else if (it.id === 'install') onInstall(game)
    else if (it.id === 'storeInstall') onStoreInstall(game)
    else if (it.id === 'resume') onResume()
    else if (it.id === 'saveState' || it.id === 'loadState' || it.id === 'fastForward' || it.id === 'menu') {
      onEmulatorAction(game, it.id)
    }
    else if (it.id === 'stop' || it.id === 'uninstall' || it.id === 'cleanInstaller') {
      if (confirm !== it.id) return setConfirm(it.id)
      setConfirm(null)
      if (it.id === 'stop') onStop(game)
      else if (it.id === 'uninstall') onUninstall(game)
      else onCleanInstaller(game)
    }
    else if (it.id === 'telegram') openTelegram()
    else if (it.id === 'achievements') setAchOpen(true)
    else if (it.id === 'identify') onIdentify(game)
    else if (it.id === 'remove') onRemove(game)
    else onClose()
  }

  useInput((a) => {
    if (a === 'back' || a === 'details') return onClose()
    if (a === 'left' || a === 'right' || a === 'up' || a === 'down') setConfirm(null)
    if (a === 'left') setSel((s) => Math.max(0, s - 1))
    if (a === 'right') setSel((s) => Math.min(items.length - 1, s + 1))
    if (a === 'up' || a === 'down') setSel((s) => rowNeighbor(menuRef.current, s, a === 'up' ? -1 : 1))
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
          ) : storeOwned ? (
            <p className="detail-note">
              Na sua conta {store}, não instalado neste PC. <b>Instalar na {store}</b> abre a instalação por lá; ele
              aparece aqui quando terminar.
            </p>
          ) : (
            <p className="detail-note">
              Não instalado. Coloque o jogo numa pasta chamada <b>{game.title.split(':')[0]}</b>
              {gamesRoot ? <> dentro de <code>{gamesRoot}</code></> : null} e ele será reconhecido no próximo
              escaneamento.
            </p>
          )}
          {game.summary && <p className="summary">{game.summary}</p>}
          {needsInstall && (
            <p className="detail-note">
              Esse download é um instalador. Escolha <b>Instalar</b>: ele já vem apontando pra pasta{' '}
              <code>Jogo</code> dentro da pasta do jogo.
            </p>
          )}
          {running && emulated?.emulator === 'retroarch' && (
            <p className="detail-note">
              No controle: segure <b>Create</b> + R1 salva, + L1 carrega, + R2 acelera, + ←/→ troca o slot, +
              Options abre o menu do RetroArch.
            </p>
          )}
          {confirm === 'stop' && <p className="detail-note">O progresso não salvo será perdido.</p>}
          {confirm === 'cleanInstaller' && (
            <p className="detail-note">
              Os arquivos do instalador vão pra Lixeira e o torrent sai do qBittorrent. O jogo instalado fica.
            </p>
          )}
          {confirm === 'uninstall' && (
            <p className="detail-note">
              {game.source === 'steam' ? (
                'A Steam vai abrir pra confirmar a desinstalação.'
              ) : (
                <>
                  A pasta vai pra Lixeira (dá pra restaurar de lá).{' '}
                  {game.igdbId ? 'O jogo continua na biblioteca.' : 'O jogo sai da biblioteca.'}
                </>
              )}
            </p>
          )}
          {installed && (
            <p className="path" title={game.exeOverride ?? game.exePath ?? game.installerPath ?? game.folder ?? ''}>
              {game.source === 'emulator'
                ? `${emulated?.name ?? 'Emulador'} · ${emulated ? EMULATOR_NAME[emulated.emulator] : ''} · ${game.folder}`
                : game.source === 'steam'
                ? `Steam · ${game.folder}`
                : game.source === 'epic'
                  ? `Epic Games · ${game.folder}`
                  : (game.exeOverride ?? game.exePath ?? game.installerPath ?? 'Nenhum executável encontrado')}
            </p>
          )}
          <div className="menu" ref={menuRef}>
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

/**
 * The menu wraps into rows: the button in the row above/below closest to the focused one's center, or
 * the same one when there is no such row.
 */
function rowNeighbor(menu: HTMLDivElement | null, current: number, dir: -1 | 1): number {
  const buttons = menu ? [...menu.children] : []
  const from = buttons[current]?.getBoundingClientRect()
  if (!from) return current
  const center = from.left + from.width / 2
  let best = current
  let bestScore = Infinity
  buttons.forEach((b, i) => {
    const r = b.getBoundingClientRect()
    const dy = (r.top - from.top) * dir
    if (dy < from.height / 2) return // same row or the wrong way
    const score = dy * 1000 + Math.abs(r.left + r.width / 2 - center)
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}
