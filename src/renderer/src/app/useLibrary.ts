import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DownloadsStatus, Game } from '@shared/types'
import { activeDownloads, groupShelves, SHELF_LABEL, SHELF_ORDER, stepShelf, type Shelf } from '../library/shelves'

/** The library list, split into shelves, plus which shelf/game the Home has in focus. */
export function useLibrary(downloads: DownloadsStatus, notify: (msg: string) => void) {
  const [games, setGames] = useState<Game[]>([])
  /** Bumped on every reload so dependents (store membership, disk space) refresh. */
  const [libraryVersion, setLibraryVersion] = useState(0)
  const [shelf, setShelf] = useState<Shelf>('installed')
  const [focus, setFocus] = useState(0)
  /** Game to focus once the list/shelves update (after reloads, "Ver na biblioteca"…). */
  const [focusTarget, setFocusTarget] = useState<number | null>(null)

  /** Reloads the list; `keepId` re-focuses that game on whatever shelf it lands. */
  const reload = useCallback(async (keepId?: number) => {
    const list = await window.api.listGames()
    setGames(list)
    setLibraryVersion((v) => v + 1)
    if (keepId !== undefined) setFocusTarget(keepId)
  }, [])

  // Scan once at start; afterwards the main process says when the library changed (downloads…).
  useEffect(() => {
    window.api.rescan().then(() => reload())
    return window.api.onLibraryChanged((msg) => {
      if (msg) notify(msg)
      reload()
    })
  }, [reload, notify])

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

  const clampedFocus = Math.min(focus, Math.max(0, shelfGames.length - 1))

  return {
    games,
    libraryVersion,
    reload,
    dlByGame,
    shelf,
    shelfGames,
    focus: clampedFocus,
    setFocus,
    /** Focused game on the current shelf. */
    game: shelfGames[clampedFocus] ?? null,
    /** Shelves to show as tabs: the non-empty ones, plus the current one. */
    shelfTabs: SHELF_ORDER.filter((k) => shelves[k].length > 0 || k === shelf).map((k) => ({
      id: k,
      label: SHELF_LABEL[k],
      count: shelves[k].length
    })),
    /** Step to the next/previous non-empty shelf, or jump to one. */
    goToShelf: (to: -1 | 1 | Shelf) => {
      const next = typeof to === 'number' ? stepShelf(shelf, to, shelves) : to
      if (next !== shelf) {
        setShelf(next)
        setFocus(0)
      }
    },
    focusGame: setFocusTarget
  }
}
