import { useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadInfo, Game } from '@shared/types'
import { GameArt } from '../components/GameArt'
import { formatReleaseDate } from '../format'
import { useInput } from '../input/useInput'
import {
  applyFilter,
  cycle,
  filterOptions,
  originOf,
  SORT_OPTIONS,
  type GridFilter,
  type Option
} from '../library/gridFilter'
import type { Shelf } from '../library/shelves'

interface Props {
  shelf: Shelf
  /** Games on the shelf, unfiltered (focus is an index into this list). */
  games: Game[]
  focus: number
  setFocus(i: number): void
  filter: GridFilter
  onFilter(f: GridFilter): void
  downloads: Map<number, DownloadInfo>
  runningId: number | null
  active: boolean
  /** Previous/next shelf (up from the filters, down from the last row). */
  onShelf(dir: -1 | 1): void
  onLaunch(g: Game): void
  onDetails(g: Game): void
  onSettings(): void
  onSearch(): void
  onTab(dir: -1 | 1): void
  onResume(): void
}

type Chip = { key: keyof GridFilter; label: string; options: Option[] }

/** PS5-style game library: a grid of covers with sort/filter chips on top. */
export function LibraryGrid(props: Props) {
  const { shelf, games, focus, setFocus, filter, onFilter, downloads, runningId, active } = props
  const { onShelf, onLaunch, onDetails, onSettings, onSearch, onTab, onResume } = props
  const gridRef = useRef<HTMLDivElement>(null)
  const [zone, setZone] = useState<'grid' | 'filters'>('grid')
  const [chip, setChip] = useState(0)

  const visible = useMemo(() => applyFilter(games, filter, shelf), [games, filter, shelf])
  const { origins, genres } = useMemo(() => filterOptions(games), [games])
  const chips: Chip[] = [
    { key: 'sort', label: 'Ordenar', options: SORT_OPTIONS },
    ...(origins.length > 2 ? [{ key: 'origin', label: 'Origem', options: origins } as Chip] : []),
    ...(genres.length > 1 ? [{ key: 'genre', label: 'Gênero', options: genres } as Chip] : [])
  ]

  const focusedId = games[focus]?.id
  const index = Math.max(0, visible.findIndex((g) => g.id === focusedId))
  const game = visible[index] ?? null
  const select = (i: number) => {
    const g = visible[Math.max(0, Math.min(visible.length - 1, i))]
    if (g) setFocus(games.indexOf(g))
  }
  // The focused game was filtered out: move to the first one shown (keeps the backdrop in sync).
  useEffect(() => {
    if (visible.length && !visible.some((g) => g.id === focusedId)) setFocus(games.indexOf(visible[0]))
  }, [visible, focusedId, games, setFocus])

  const columns = () => {
    const grid = gridRef.current
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 1
  }

  useEffect(() => {
    gridRef.current?.children[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [index, visible])

  const cycleChip = (c: Chip) => onFilter({ ...filter, [c.key]: cycle(c.options, filter[c.key]) })

  useInput((a) => {
    if (a === 'options') return onSettings()
    if (a === 'secondary') return onSearch()
    if (a === 'pageLeft') return onTab(-1)
    if (a === 'pageRight') return onTab(1)
    if (a === 'back' && runningId != null) return onResume()
    if (zone === 'filters') {
      if (a === 'up') return onShelf(-1)
      if (a === 'down' || a === 'back') return visible.length && setZone('grid')
      if (a === 'left') return setChip((c) => Math.max(0, c - 1))
      if (a === 'right') return setChip((c) => Math.min(chips.length - 1, c + 1))
      if (a === 'confirm' && chips[chip]) cycleChip(chips[chip])
      return
    }
    const cols = columns()
    if (a === 'up') return index < cols ? setZone('filters') : select(index - cols)
    if (a === 'down') {
      const lastRow = Math.floor((visible.length - 1) / cols)
      return Math.floor(index / cols) >= lastRow ? onShelf(1) : select(index + cols)
    }
    if (a === 'left') return select(index - 1)
    if (a === 'right') return select(index + 1)
    if (!game) return
    if (a === 'confirm') onLaunch(game)
    else if (a === 'details') onDetails(game)
  }, active)

  // Nothing left after filtering: the chips are the only thing to move on.
  useEffect(() => {
    if (!visible.length) setZone('filters')
  }, [visible.length])

  const meta = (g: Game) => {
    const dl = downloads.get(g.id)
    if (dl) return `Baixando ${Math.floor(dl.progress * 100)}%`
    if (shelf === 'upcoming') return formatReleaseDate(g.releaseDate)
    return [originOf(g).value === 'folder' ? null : originOf(g).label, g.releaseYear].filter(Boolean).join(' · ')
  }

  return (
    <div className="library-grid">
      <div className={`grid-filters ${zone === 'filters' ? 'active' : ''}`}>
        {chips.map((c, i) => (
          <button
            key={c.key}
            className={[
              'grid-chip',
              zone === 'filters' && i === chip ? 'focused' : '',
              c.key !== 'sort' && filter[c.key] !== 'all' ? 'on' : ''
            ].join(' ')}
            onClick={() => {
              setZone('filters')
              setChip(i)
              cycleChip(c)
            }}
          >
            <span className="grid-chip-label">{c.label}</span>
            {c.options.find((o) => o.value === filter[c.key])?.label}
          </button>
        ))}
        <span className="grid-count">
          {visible.length === games.length ? `${games.length} jogos` : `${visible.length} de ${games.length}`}
        </span>
      </div>
      {visible.length === 0 ? (
        <p className="grid-empty">Nenhum jogo com esses filtros.</p>
      ) : (
        <div className="grid-scroll">
          <div className="grid" ref={gridRef}>
            {visible.map((g, i) => (
              <div
                key={g.id}
                className={[
                  'grid-item',
                  zone === 'grid' && i === index ? 'focused' : '',
                  g.folder ? '' : 'uninstalled'
                ].join(' ')}
                onClick={() => {
                  setZone('grid')
                  if (i === index) onDetails(g)
                  else select(i)
                }}
                onDoubleClick={() => onLaunch(g)}
              >
                <div className="grid-cover">
                  <GameArt game={g} className="tile-art" />
                  {runningId === g.id && <span className="tile-badge">Em execução</span>}
                  {downloads.has(g.id) && (
                    <span className="tile-progress" style={{ width: `${downloads.get(g.id)!.progress * 100}%` }} />
                  )}
                </div>
                <span className="grid-title">{g.title}</span>
                <span className="grid-meta">{meta(g)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
