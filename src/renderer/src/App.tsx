import { useEffect, useState } from 'react'
import type { Game, Settings as S, StoreGame } from '@shared/types'
import { useGameSession } from './app/useGameSession'
import { useInputDevices } from './app/useInputDevices'
import { useLibrary } from './app/useLibrary'
import { useStorage, useSystemStatus } from './app/useSystemStatus'
import { useToast } from './app/useToast'
import { Background, type BackdropArt } from './components/Background'
import { Toast } from './components/Toast'
import { TopBar, type Tab } from './components/TopBar'
import { mediaUrl } from './format'
import { GameDetail } from './screens/GameDetail'
import { Home } from './screens/Home'
import { PowerMenu } from './screens/PowerMenu'
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
  | { kind: 'power' }

export function App() {
  const [settings, setSettings] = useState<S | null>(null)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [tab, setTab] = useState<Tab>('games')
  const [storeArt, setStoreArt] = useState<BackdropArt | null>(null)
  const [installingId, setInstallingId] = useState<number | null>(null)

  const { toast, notify } = useToast()
  const { downloads, update, version } = useSystemStatus(notify)
  const lib = useLibrary(downloads, notify)
  const storage = useStorage(lib.libraryVersion, settings?.gamesRoot ?? null)
  const session = useGameSession({
    notify,
    reload: lib.reload,
    onOverlayOpened: (runningId) => {
      setOverlay({ kind: 'none' })
      setTab('games')
      lib.focusGame(runningId)
    }
  })

  const atHome = tab === 'games' && overlay.kind === 'none'
  // PS button: launcher over the game while playing; otherwise back to the games home, and from the
  // home itself the power menu (like the PS5).
  const pad = useInputDevices(notify, () => {
    if (session.runningRef.current != null) return void window.api.overlayToggle()
    if (!document.hasFocus()) return
    if (atHome) return setOverlay({ kind: 'power' })
    setOverlay({ kind: 'none' })
    setTab('games')
  })

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  const close = () => setOverlay({ kind: 'none' })
  const openSettings = () => setOverlay({ kind: 'settings' })
  const openSearch = () => setOverlay({ kind: 'search', mode: { kind: 'add' } })
  const switchTab = (dir: -1 | 1) =>
    setTab((t) => (dir > 0 ? (t === 'games' ? 'store' : t) : t === 'store' ? 'games' : t))

  const onHomeConfirm = (g: Game) => {
    if (session.runningId === g.id) return void session.resume()
    if (g.folder && (g.exePath || g.launchUri) && !lib.dlByGame.has(g.id)) return session.launch(g)
    // Not installed (or a repack to install): show what to do instead of failing silently.
    setOverlay({ kind: 'detail', gameId: g.id })
  }
  const showInLibrary = (gameId: number) => {
    lib.focusGame(gameId)
    setTab('games')
    close()
  }

  const { game } = lib
  const homeArt: BackdropArt | null = game
    ? { key: `game-${game.id}`, url: mediaUrl(game.artPath ?? game.coverPath), wide: !!game.artPath, seed: game.title }
    : null
  const telegramPeer = settings?.telegramLoggedIn && settings.telegramPeer ? settings.telegramPeer : null
  const detailGame = overlay.kind === 'detail' ? lib.games.find((g) => g.id === overlay.gameId) : undefined
  const playing = session.runningId != null ? (lib.games.find((g) => g.id === session.runningId)?.title ?? null) : null

  return (
    <div className="app">
      <Background art={tab === 'games' ? homeArt : storeArt} />
      <TopBar
        pad={pad}
        storage={storage}
        playing={playing}
        tab={tab}
        onTab={(t) => overlay.kind === 'none' && setTab(t)}
      />
      <Store
        active={tab === 'store' && overlay.kind === 'none'}
        libraryVersion={lib.libraryVersion}
        onOpen={(g) => setOverlay({ kind: 'storeDetail', game: g })}
        onTab={switchTab}
        onSettings={openSettings}
        onSearch={openSearch}
        onBackdrop={setStoreArt}
      />
      {tab === 'games' && (
        <Home
          games={lib.shelfGames}
          totalGames={lib.games.length}
          shelves={lib.shelfTabs}
          shelf={lib.shelf}
          onShelf={lib.goToShelf}
          downloads={lib.dlByGame}
          focus={lib.focus}
          setFocus={lib.setFocus}
          active={atHome}
          runningId={session.runningId}
          onResume={session.resume}
          onLaunch={onHomeConfirm}
          onDetails={(g) => setOverlay({ kind: 'detail', gameId: g.id })}
          onSettings={openSettings}
          onSearch={openSearch}
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
            await lib.reload()
            setOverlay({ kind: 'storeDetail', game: { ...sg, inLibraryId: res.value.id } })
          }}
          onShowInLibrary={showInLibrary}
          onClose={close}
        />
      )}
      {detailGame && (
        <GameDetail
          game={detailGame}
          running={session.runningId === detailGame.id}
          installing={installingId === detailGame.id}
          download={lib.dlByGame.get(detailGame.id) ?? null}
          gamesRoot={settings?.gamesRoot ?? null}
          telegramPeer={telegramPeer}
          onLaunch={session.launch}
          onResume={session.resume}
          onStop={session.stop}
          onUninstall={async (g) => {
            const res = await window.api.uninstallGame(g.id)
            if (!res.ok) return notify(res.error)
            if (g.source === 'steam') return notify('Confirme a desinstalação na Steam')
            notify(`${g.title} desinstalado — a pasta está na Lixeira`)
            if (!g.igdbId) close()
            await lib.reload(g.igdbId ? g.id : undefined)
          }}
          onInstall={async (g) => {
            setInstallingId(g.id)
            const res = await window.api.installGame(g.id)
            setInstallingId(null)
            await lib.reload(g.id)
            notify(res.ok ? `${g.title} instalado — pronto pra jogar` : res.error)
          }}
          onCleanInstaller={async (g) => {
            const res = await window.api.cleanInstaller(g.id)
            if (!res.ok) return notify(res.error)
            notify('Instalador na Lixeira')
            await lib.reload(g.id)
          }}
          onStoreInstall={async (g) => {
            const res = await window.api.storeInstall(g.id)
            if (!res.ok) notify(res.error)
          }}
          onIdentify={(g) => setOverlay({ kind: 'search', mode: { kind: 'link', game: g } })}
          onRemove={async (g) => {
            const res = await window.api.removeGame(g.id)
            if (!res.ok) return notify(res.error)
            notify(`${g.title} removido`)
            close()
            await lib.reload()
          }}
          onClose={close}
        />
      )}
      {overlay.kind === 'search' && (
        <Search
          mode={overlay.mode}
          notify={notify}
          onDone={async (g) => {
            await lib.reload(g.id)
            close()
          }}
          onClose={() =>
            setOverlay(
              overlay.mode.kind === 'link' ? { kind: 'detail', gameId: overlay.mode.game.id } : { kind: 'none' }
            )
          }
        />
      )}
      {overlay.kind === 'settings' && settings && (
        <Settings
          settings={settings}
          onPickRoot={async () => {
            const root = await window.api.pickGamesRoot()
            if (!root) return
            setSettings(await window.api.getSettings())
            await lib.reload()
            notify('Biblioteca atualizada')
          }}
          onRescan={async () => {
            const r = await window.api.rescan()
            await lib.reload(game?.id)
            notify(`${r.total} jogos · ${r.added} novos · ${r.removed} removidos`)
          }}
          onToggleFullscreen={async () =>
            setSettings(await window.api.setSettings({ fullscreen: !settings.fullscreen }))
          }
          onSetIgdbClientId={async (v) => setSettings(await window.api.setSettings({ igdbClientId: v }))}
          onSetIgdbSecret={async (v) => {
            setSettings(await window.api.setIgdbSecret(v))
            notify(v.trim() ? 'Secret salvo' : 'Secret removido')
          }}
          onSettings={setSettings}
          onPower={() => setOverlay({ kind: 'power' })}
          downloads={downloads}
          storage={storage}
          version={version}
          update={update}
          notify={notify}
          onClose={close}
        />
      )}
      {overlay.kind === 'power' && (
        <PowerMenu
          gameRunning={session.runningId != null}
          onPower={async (action) => {
            close()
            if (action === 'quit') return void window.api.quitApp()
            const res = await window.api.power(action)
            if (!res.ok) notify(res.error)
          }}
          onClose={close}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}
