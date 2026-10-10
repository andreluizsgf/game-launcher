import { useCallback, useEffect, useRef, useState } from 'react'
import type { Game, Settings as S, StoreGame } from '@shared/types'
import { Background, type BackdropArt } from './components/Background'
import { Toast } from './components/Toast'
import { TopBar, type Tab } from './components/TopBar'
import { formatPlaytime, mediaUrl } from './format'
import { startGamepadLoop, type PadStatus } from './input/gamepad'
import { startKeyboard } from './input/keyboard'
import { startMouseTracking } from './input/mode'
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
    setFocus((f) => {
      const idx = keepId !== undefined ? list.findIndex((g) => g.id === keepId) : -1
      return idx >= 0 ? idx : Math.min(f, Math.max(0, list.length - 1))
    })
  }, [])

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.rescan().then(() => reload())
  }, [reload])

  useEffect(() => {
    let prev = false
    const stopPad = startGamepadLoop((s) => {
      setPad(s)
      if (s.connected !== prev) notify(s.connected ? 'Controle conectado' : 'Controle desconectado')
      prev = s.connected
    })
    const stopKb = startKeyboard()
    const stopMouse = startMouseTracking()
    const offStart = window.api.onGameStarted((id) => setRunningId(id))
    const offEnd = window.api.onGameEnded(({ gameId, seconds }) => {
      setRunningId(null)
      notify(`Sessão encerrada · ${formatPlaytime(seconds)}`)
      reload(gameId)
    })
    return () => {
      stopPad()
      stopKb()
      stopMouse()
      offStart()
      offEnd()
    }
  }, [notify, reload])

  const launch = async (g: Game) => {
    if (runningId === g.id) return
    const res = await window.api.launch(g.id)
    if (!res.ok) notify(res.error)
  }

  const onHomeConfirm = (g: Game) => {
    if (g.folder) return launch(g)
    // Not installed: show where to put it instead of failing silently.
    setOverlay({ kind: 'detail', gameId: g.id })
  }

  const game = games[focus] ?? null
  const homeArt: BackdropArt | null = game
    ? { key: `game-${game.id}`, url: mediaUrl(game.artPath ?? game.coverPath), wide: !!game.artPath, seed: game.title }
    : null
  const switchTab = (dir: -1 | 1) => setTab((t) => (dir > 0 ? (t === 'games' ? 'store' : t) : t === 'store' ? 'games' : t))
  const showInLibrary = (gameId: number) => {
    const idx = games.findIndex((g) => g.id === gameId)
    if (idx >= 0) setFocus(idx)
    setTab('games')
    setOverlay({ kind: 'none' })
  }
  const telegramPeer = settings?.telegramLoggedIn && settings.telegramPeer ? settings.telegramPeer : null
  const detailGame = overlay.kind === 'detail' ? games.find((g) => g.id === overlay.gameId) : undefined

  return (
    <div className="app">
      <Background art={tab === 'games' ? homeArt : storeArt} />
      <TopBar pad={pad} tab={tab} onTab={(t) => overlay.kind === 'none' && setTab(t)} />
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
          games={games}
          focus={focus}
          setFocus={setFocus}
          active={tab === 'games' && overlay.kind === 'none'}
          runningId={runningId}
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
          gamesRoot={settings?.gamesRoot ?? null}
          telegramPeer={telegramPeer}
          onLaunch={launch}
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
          notify={notify}
          onClose={() => setOverlay({ kind: 'none' })}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
