import { useEffect, useRef, useState } from 'react'
import { EMULATOR_NAME, systemById } from '@shared/systems'
import type { DownloadInfo, EmulatorAction, Game, GameAchievements } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { GameArt } from '../components/GameArt'
import { formatDate, formatDownload, formatPlaytime } from '../format'
import { useInput } from '../input/useInput'
import { Achievements } from './Achievements'
import { MediaStrip } from '../media/MediaStrip'
import { MediaViewer } from '../media/MediaViewer'
import { useGameMedia } from '../media/useGameMedia'
import { TelegramPanel } from '../telegram/TelegramPanel'
import { telegramMenuLabel, telegramSystemOf, useTelegramThread, type TgPeers } from '../telegram/useTelegramThread'

interface Props {
  game: Game
  running: boolean
  /** Its installer is open. */
  installing: boolean
  /** Active download of this game, if any. */
  download: DownloadInfo | null
  gamesRoot: string | null
  /** Telegram chats; the game's system picks one (PC or PS2). */
  telegramPeers: TgPeers
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
  /** Flips the virtual Xbox pad for games that only read XInput. */
  onToggleXinput(g: Game): void
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
    | 'xinput'
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
  const { game, running, installing, download, gamesRoot, telegramPeers, onLaunch, onResume, onStop } = props
  const { onUninstall, onInstall, onCleanInstaller, onStoreInstall, onEmulatorAction, onToggleXinput } = props
  const { onIdentify, onRemove, onClose } = props
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
  const tgSystem = telegramSystemOf(game)
  const telegramPeer = tgSystem ? telegramPeers[tgSystem] : null
  const tg = useTelegramThread(game.title, !!telegramPeer && tgAsked, game.igdbId, tgSystem ?? 'pc')
  const openTelegram = () => {
    setTgAsked(true)
    setTgOpen(true)
  }
  const items: Item[] = [
    ...(running
      ? [
          { id: 'resume', label: 'Voltar ao jogo' } as Item,
          ...(emulated?.emulator === 'retroarch' || emulated?.emulator === 'pcsx2'
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
    // PC games only: emulators read the DualSense themselves.
    ...(installed && playable && !emulated
      ? [{ id: 'xinput', label: `Controle de Xbox · ${game.inputMode === 'xinput' ? 'ligado' : 'desligado'}` } as Item]
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
  const media = useGameMedia(game.igdbId)
  // ↓ past the last row of buttons reaches the gallery strip.
  const [zone, setZone] = useState<'menu' | 'media'>('menu')
  const [mediaSel, setMediaSel] = useState(0)
  const [viewing, setViewing] = useState<number | null>(null)

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
    else if (it.id === 'xinput') onToggleXinput(game)
    else if (it.id === 'telegram') openTelegram()
    else if (it.id === 'achievements') setAchOpen(true)
    else if (it.id === 'identify') onIdentify(game)
    else if (it.id === 'remove') onRemove(game)
    else onClose()
  }

  useInput((a) => {
    if (zone === 'media') {
      if (a === 'back' || a === 'up') setZone('menu')
      else if (a === 'details') onClose()
      else if (a === 'left') setMediaSel((s) => Math.max(0, s - 1))
      else if (a === 'right') setMediaSel((s) => Math.min(media.length - 1, s + 1))
      else if (a === 'confirm' && media[mediaSel]) setViewing(mediaSel)
      return
    }
    if (a === 'back' || a === 'details') return onClose()
    if (a === 'left' || a === 'right' || a === 'up' || a === 'down') setConfirm(null)
    if (a === 'left') setSel((s) => Math.max(0, s - 1))
    if (a === 'right') setSel((s) => Math.min(items.length - 1, s + 1))
    if (a === 'up') setSel((s) => rowNeighbor(menuRef.current, s, -1))
    if (a === 'down') {
      const below = rowNeighbor(menuRef.current, sel, 1)
      if (below !== sel) setSel(below)
      else if (media.length) {
        setMediaSel((s) => Math.min(s, media.length - 1))
        setZone('media')
      }
    }
    if (a === 'confirm') run(items[sel])
  }, !tgOpen && !achOpen && viewing == null)

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
          {running && (emulated?.emulator === 'retroarch' || emulated?.emulator === 'pcsx2') && (
            <p className="detail-note">
              No controle: o <b>touchpad</b> (clique) é o Select; segure <b>Create</b> + R1 salva, + L1 carrega, + R2 acelera, + ←/→ troca o slot
              {emulated.emulator === 'retroarch' ? ', + Options abre o menu do RetroArch' : ''}.
            </p>
          )}
          {zone === 'menu' && items[sel]?.id === 'xinput' && (
            <p className="detail-note">
              Pra jogos que só aceitam controle de Xbox: o DualSense aparece pro jogo como um. O botão PS continua
              abrindo o menu. Precisa do <b>ViGEmBus</b> instalado.
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
                className={`menu-item ${zone === 'menu' && sel === i ? 'focused' : ''} ${it.danger ? 'danger' : ''}`}
                disabled={it.disabled}
                onClick={() => {
                  setZone('menu')
                  setSel(i)
                  run(it)
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
          <MediaStrip
            media={media}
            focused={zone === 'media' ? mediaSel : null}
            onOpen={(i) => {
              setZone('media')
              setMediaSel(i)
              setViewing(i)
            }}
          />
        </div>
      </div>
      <ButtonHints
        hints={[
          { button: '✕', label: 'Selecionar' },
          { button: '○', label: 'Voltar' }
        ]}
      />
      {viewing != null && (
        <MediaViewer media={media} start={viewing} title={game.title} onClose={() => setViewing(null)} />
      )}
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
