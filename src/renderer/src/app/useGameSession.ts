import { useEffect, useRef, useState } from 'react'
import type { Game } from '@shared/types'
import { formatPlaytime } from '../format'

interface Deps {
  notify(msg: string): void
  reload(keepId?: number): Promise<void>
  /** The launcher was brought over the running game: show its home, focused on that game. */
  onOverlayOpened(runningId: number): void
}

/** The game being played: launching, going back to it, force-closing it, and session end. */
export function useGameSession({ notify, reload, onOverlayOpened }: Deps) {
  const [runningId, setRunningId] = useState<number | null>(null)
  const runningRef = useRef<number | null>(null)
  runningRef.current = runningId
  const opened = useRef(onOverlayOpened)
  opened.current = onOverlayOpened

  useEffect(() => {
    const offStart = window.api.onGameStarted((id) => setRunningId(id))
    const offEnd = window.api.onGameEnded(({ gameId, seconds }) => {
      setRunningId(null)
      notify(`Sessão encerrada · ${formatPlaytime(seconds)}`)
      reload(gameId)
    })
    // PS button / Ctrl+Shift+G during a game.
    const offOverlay = window.api.onOverlay((open) => {
      if (open && runningRef.current != null) opened.current(runningRef.current)
    })
    return () => {
      offStart()
      offEnd()
      offOverlay()
    }
  }, [notify, reload])

  const resume = () => window.api.overlayHide()

  return {
    runningId,
    /** Read inside long-lived callbacks (input loops) without re-subscribing. */
    runningRef,
    resume,
    /** Launches, or goes back to it when it's the one already running. */
    launch: async (g: Game) => {
      if (runningId === g.id) return void resume()
      const res = await window.api.launch(g.id)
      if (!res.ok) notify(res.error)
    },
    stop: async (g: Game) => {
      const res = await window.api.stopGame(g.id)
      if (!res.ok) notify(res.error)
    }
  }
}
