import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadsStatus, Game, Settings as S, StorageInfo, StoreGame } from '@shared/types'
import { Background, type BackdropArt } from './components/Background'
import { Toast } from './components/Toast'
import { TopBar, type Tab } from './components/TopBar'
import { formatPlaytime, mediaUrl } from './format'
import { startGamepadLoop, type PadStatus } from './input/gamepad'
import { startHidPads } from './input/hidPads'
import { startKeyboard } from './input/keyboard'
import { startMouseTracking } from './input/mode'
import { activeDownloads, groupShelves, SHELF_LABEL, SHELF_ORDER, stepShelf, type Shelf } from './library/shelves'
import { GameDetail } from './screens/GameDetail'
import { Home } from './screens/Home'
import { Search, type SearchMode } from './screens/Search'
import { Settings } from './screens/Settings'
import { Store } from './screens/Store'
import { StoreDetail } from './screens/StoreDetail'

type Overlay =
  | { kind: 'none' }
  | { kind: 'detail'; gameId: number }
  | { kind: 'settings' }
  | { kind: 'search'; mode: SearchMode }
  | { kind: 'storeDetail'; game: StoreGame }

export function App() {
  const [games, setGames] = useState<Game[]>([])
  const [settings, setSettings] = useState<S | null>(null)
  const [focus, setFocus] = useState(0)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [pad, setPad] = useState<PadStatus>({ connected: false, name: null })
  const [runningId, setRunningId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('games')
  const [storeArt, setStoreArt] = useState<BackdropArt | null>(null)
  const [libraryVersion, setLibraryVersion] = useState(0)
  const [downloads, setDownloads] = useState<DownloadsStatus>({ available: false, items: [] })
  const [shelf, setShelf] = useState<Shelf>('installed')
  /** Game to focus once the list/shelves update (after reloads, "Ver na biblioteca"…). */
  const [focusTarget, setFocusTarget] = useState<number | null>(null)
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const runningRef = useRef<number | null>(null)
  runningRef.current = runningId
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const notify = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  /** Reloads the list keeping focus on the same game when possible. */
  const reload = useCallback(async (keepId?: number) => {
    const list = await window.api.listGames()
    setGames(list)
    setLibraryVersion((v) => v + 1)
    if (keepId !== undefined) setFocusTarget(keepId)
  }, [])

  // Free space on the games drive: every 30 s (downloads fill it), and whenever the library or root changes.
  useEffect(() => {
    const refresh = () => window.api.storage().then(setStorage)
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [libraryVersion, settings?.gamesRoot])

  const dlByGame = useMemo(() => activeDownloads(downloads.items), [downloads])
  const shelves = useMemo(() => groupShelves(games, dlByGame), [games, dlByGame])
  const shelfGames = shelves[shelf]

  // Follow a focus target to whatever shelf it's on; otherwise never sit on an empty shelf.
  useEffect(() => {
    if (focusTarget != null) {
      const key = SHELF_ORDER.find((k) => shelves[k].some((g) => g.id === focusTarget))
      if (key) {
        setShelf(key)
        setFocus(shelves[key].findIndex((g) => g.id === focusTarget))
      }
      setFocusTarget(null)
      return
    }
    if (shelfGames.length === 0) {
      const other = SHELF_ORDER.find((k) => shelves[k].length > 0)
      if (other && other !== shelf) {
        setShelf(other)
        setFocus(0)
      }
    } else if (focus >= shelfGames.length) setFocus(shelfGames.length - 1)
  }, [shelves, shelf, shelfGames.length, focus, focusTarget])

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.rescan().then(() => reload())
  }, [reload])

  useEffect(() => {
    let prev = false
    const stopPad = startGamepadLoop(
      (s) => {
        setPad(s)
        if (s.connected !== prev) notify(s.connected ? 'Controle conectado' : 'Controle desconectado')
        prev = s.connected
      },
      // PS button: quick menu during a game, otherwise back to the games home (like the PS5).
      () => {
        if (runningRef.current != null) return void window.api.overlayToggle()
        if (!document.hasFocus()) return
        setOverlay({ kind: 'none' })
        setTab('games')
      }
    )
    // PS button / Ctrl+Shift+G during a game: the launcher comes up as usual, focused on the running game.
    const offOverlay = window.api.onOverlay((open) => {
      if (!open || runningRef.current == null) return
      setOverlay({ kind: 'none' })
      setTab('games')
      setFocusTarget(runningRef.current)
    })
    const stopHid = startHidPads()
    const stopKb = startKeyboard()
    const stopMouse = startMouseTracking()
    window.api.getDownloads().then(setDownloads)
    const offDownloads = window.api.onDownloads(setDownloads)
    const offLibrary = window.api.onLibraryChanged((msg) => {
      if (msg) notify(msg)
      reload()
    })
    const offStart = window.api.onGameStarted((id) => setRunningId(id))
    const offEnd = window.api.onGameEnded(({ gameId, seconds }) => {
      setRunningId(null)
      notify(`Sessão encerrada · ${formatPlaytime(seconds)}`)
      reload(gameId)
    })
    return () => {
      stopPad()
      stopHid()
      stopKb()
      stopMouse()
      offStart()
      offEnd()
      offDownloads()
      offLibrary()
      offOverlay()
    }
  }, [notify, reload])

  const resumeGame = () => window.api.overlayHide()
  const stopGame = async (g: Game) => {
    const res = await window.api.stopGame(g.id)
    if (!res.ok) notify(res.error)
  }

  const launch = async (g: Game) => {
    if (runningId === g.id) return void resumeGame()
    const res = await window.api.launch(g.id)
    if (!res.ok) notify(res.error)
  }

  const onHomeConfirm = (g: Game) => {
    if (runningId === g.id) return void resumeGame()
    if (g.folder && !dlByGame.has(g.id)) return launch(g)
    // Not installed: show where to put it instead of failing silently.
    setOverlay({ kind: 'detail', gameId: g.id })
  }

  const game = shelfGames[Math.min(focus, shelfGames.length - 1)] ?? null
  const homeArt: BackdropArt | null = game
    ? { key: `game-${game.id}`, url: mediaUrl(game.artPath ?? game.coverPath), wide: !!game.artPath, seed: game.title }
    : null
  const switchTab = (dir: -1 | 1) => setTab((t) => (dir > 0 ? (t === 'games' ? 'store' : t) : t === 'store' ? 'games' : t))
  const showInLibrary = (gameId: number) => {
    setFocusTarget(gameId)
    setTab('games')
    setOverlay({ kind: 'none' })
  }
  const telegramPeer = settings?.telegramLoggedIn && settings.telegramPeer ? settings.telegramPeer : null
  const detailGame = overlay.kind === 'detail' ? games.find((g) => g.id === overlay.gameId) : undefined

  return (
    <div className="app">
      <Background art={tab === 'games' ? homeArt : storeArt} />
      <TopBar
        pad={pad}
        storage={storage}
        playing={runningId != null ? (games.find((g) => g.id === runningId)?.title ?? null) : null}
        tab={tab} onTab={(t) => overlay.kind === 'none' && setTab(t)} />
      <Store
        active={tab === 'store' && overlay.kind === 'none'}
        libraryVersion={libraryVersion}
        onOpen={(g) => setOverlay({ kind: 'storeDetail', game: g })}
        onTab={switchTab}
        onSettings={() => setOverlay({ kind: 'settings' })}
        onSearch={() => setOverlay({ kind: 'search', mode: { kind: 'add' } })}
        onBackdrop={setStoreArt}
      />
      {tab === 'games' && (
        <Home
          games={shelfGames}
          totalGames={games.length}
          shelves={SHELF_ORDER.filter((k) => shelves[k].length > 0 || k === shelf).map((k) => ({
            id: k,
            label: SHELF_LABEL[k],
            count: shelves[k].length
          }))}
          shelf={shelf}
          onShelf={(to) => {
            const next = typeof to === 'number' ? stepShelf(shelf, to, shelves) : to
            if (next !== shelf) {
              setShelf(next)
              setFocus(0)
            }
          }}
          downloads={dlByGame}
          focus={Math.min(focus, Math.max(0, shelfGames.length - 1))}
          setFocus={setFocus}
          active={tab === 'games' && overlay.kind === 'none'}
          runningId={runningId}
          onResume={resumeGame}
          onLaunch={onHomeConfirm}
          onDetails={(g) => setOverlay({ kind: 'detail', gameId: g.id })}
          onSettings={() => setOverlay({ kind: 'settings' })}
          onSearch={() => setOverlay({ kind: 'search', mode: { kind: 'add' } })}
          onTab={switchTab}
        />
      )}
      {overlay.kind === 'storeDetail' && (
        <StoreDetail
          game={overlay.game}
          telegramPeer={telegramPeer}
          onAdd={async (sg) => {
            const res = await window.api.catalogAdd(sg.igdbId)
            if (!res.ok) return notify(res.error)
            notify(`${res.value.title} adicionado à sua lista`)
            await reload()
            setOverlay({ kind: 'storeDetail', game: { ...sg, inLibraryId: res.value.id } })
          }}
          onShowInLibrary={showInLibrary}
          onClose={() => setOverlay({ kind: 'none' })}
        />
      )}
      {detailGame && (
        <GameDetail
          game={detailGame}
          running={runningId === detailGame.id}
          download={dlByGame.get(detailGame.id) ?? null}
          gamesRoot={settings?.gamesRoot ?? null}
          telegramPeer={telegramPeer}
          onLaunch={launch}
          onResume={resumeGame}
          onStop={stopGame}
          onUninstall={async (g) => {
            const res = await window.api.uninstallGame(g.id)
            if (!res.ok) return notify(res.error)
            notify(`${g.title} desinstalado — a pasta está na Lixeira`)
            if (!g.igdbId) setOverlay({ kind: 'none' })
            await reload(g.igdbId ? g.id : undefined)
          }}
          onIdentify={(g) => setOverlay({ kind: 'search', mode: { kind: 'link', game: g } })}
          onRemove={async (g) => {
            const res = await window.api.removeGame(g.id)
            if (!res.ok) return notify(res.error)
            notify(`${g.title} removido`)
            setOverlay({ kind: 'none' })
            await reload()
          }}
          onClose={() => setOverlay({ kind: 'none' })}
        />
      )}
      {overlay.kind === 'search' && (
        <Search
          mode={overlay.mode}
          notify={notify}
          onDone={async (g) => {
            await reload(g.id)
            setOverlay({ kind: 'none' })
          }}
          onClose={() => setOverlay(overlay.mode.kind === 'link' ? { kind: 'detail', gameId: overlay.mode.game.id } : { kind: 'none' })}
        />
      )}
      {overlay.kind === 'settings' && settings && (
        <Settings
          settings={settings}
          onPickRoot={async () => {
            const root = await window.api.pickGamesRoot()
            if (!root) return
            setSettings(await window.api.getSettings())
            await reload()
            notify('Biblioteca atualizada')
          }}
          onRescan={async () => {
            const r = await window.api.rescan()
            await reload(game?.id)
            notify(`${r.total} jogos · ${r.added} novos · ${r.removed} removidos`)
          }}
          onToggleFullscreen={async () => setSettings(await window.api.setSettings({ fullscreen: !settings.fullscreen }))}
          onSetIgdbClientId={async (v) => setSettings(await window.api.setSettings({ igdbClientId: v }))}
          onSetIgdbSecret={async (v) => {
            setSettings(await window.api.setIgdbSecret(v))
            notify(v.trim() ? 'Secret salvo' : 'Secret removido')
          }}
          onSettings={setSettings}
          downloads={downloads}
          storage={storage}
          notify={notify}
          onClose={() => setOverlay({ kind: 'none' })}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
