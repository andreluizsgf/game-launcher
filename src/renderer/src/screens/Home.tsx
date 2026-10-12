import { useEffect, useRef, type WheelEvent } from 'react'
import type { DownloadInfo, Game } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { GameArt } from '../components/GameArt'
import { formatDownload, formatPlaytime, formatReleaseDate } from '../format'
import { useInput } from '../input/useInput'
import type { Shelf } from '../library/shelves'

const SOURCE_LABEL: Record<Game['source'], string> = { folder: '', steam: 'Steam', epic: 'Epic Games' }

interface ShelfTab {
  id: Shelf
  label: string
  count: number
}

interface Props {
  /** Games on the current shelf. */
  games: Game[]
  /** Whole library size, for the empty state. */
  totalGames: number
  shelves: ShelfTab[]
  shelf: Shelf
  /** Step to the next/previous non-empty shelf, or jump to one (mouse). */
  onShelf(to: -1 | 1 | Shelf): void
  /** Active downloads by game id. */
  downloads: Map<number, DownloadInfo>
  focus: number
  setFocus(i: number): void
  active: boolean
  runningId: number | null
  /** Back to the running game (launcher brought up over it). */
  onResume(): void
  onLaunch(g: Game): void
  onDetails(g: Game): void
  onSettings(): void
  onSearch(): void
  onTab(dir: -1 | 1): void
}

export function Home(props: Props) {
  const { games, totalGames, shelves, shelf, onShelf, downloads } = props
  const { focus, setFocus, active, runningId, onResume, onLaunch, onDetails, onSettings, onSearch, onTab } = props
  const rowRef = useRef<HTMLDivElement>(null)
  const game = games[focus] ?? null
  const dl = game ? downloads.get(game.id) : undefined
  const clamp = (i: number) => Math.max(0, Math.min(games.length - 1, i))

  useInput((a) => {
    if (a === 'options') return onSettings()
    if (a === 'secondary') return onSearch()
    if (a === 'pageLeft') return onTab(-1)
    if (a === 'pageRight') return onTab(1)
    if (a === 'back' && runningId != null) return onResume()
    if (a === 'up') return onShelf(-1)
    if (a === 'down') return onShelf(1)
    if (!game) return
    if (a === 'left') setFocus(clamp(focus - 1))
    else if (a === 'right') setFocus(clamp(focus + 1))
    else if (a === 'confirm') onLaunch(game)
    else if (a === 'details') onDetails(game)
  }, active)

  // Keep the focused tile anchored near the left edge, like the PS5 home row.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    // Every tile before the focused one is unfocused, so the offset is arithmetic.
    // (Measuring offsetLeft would catch the previous tile mid-shrink animation.)
    const css = getComputedStyle(row)
    const step = parseFloat(css.getPropertyValue('--tile')) + parseFloat(css.columnGap || '0')
    row.style.transform = `translateX(${-focus * step}px)`
  }, [focus, games.length])

  // Mouse wheel walks the row one game per notch (throttled so trackpads don't fly).
  const wheelAt = useRef(0)
  const onWheel = (e: WheelEvent) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Math.abs(d) < 4 || Date.now() - wheelAt.current < 120) return
    wheelAt.current = Date.now()
    setFocus(clamp(focus + (d > 0 ? 1 : -1)))
  }

  if (totalGames === 0) {
    return (
      <main className="home empty">
        <h1>Nenhum jogo encontrado</h1>
        <p>Escolha a pasta onde ficam seus jogos (cada subpasta vira um jogo) ou adicione pela busca.</p>
        <ButtonHints
          hints={[
            { button: '□', label: 'Adicionar jogo' },
            { button: 'OPTIONS', label: 'Configurações' }
          ]}
        />
      </main>
    )
  }

  return (
    <main className="home">
      {shelves.length > 1 && (
        <nav className="shelves">
          {shelves.map((s) => (
            <button
              key={s.id}
              className={`shelf ${s.id === shelf ? 'active' : ''}`}
              onClick={() => onShelf(s.id)}
            >
              {s.label}
              <span className="shelf-count">{s.count}</span>
            </button>
          ))}
          <span className="shelf-hint">↑↓</span>
        </nav>
      )}
      <div className="row-viewport" onWheel={onWheel}>
        <div className="row" ref={rowRef}>
          {games.map((g, i) => (
            <div
              key={g.id}
              className={`tile ${i === focus ? 'focused' : ''} ${g.folder ? '' : 'uninstalled'}`}
              onClick={() => (i === focus ? onDetails(g) : setFocus(i))}
              onDoubleClick={() => onLaunch(g)}
            >
              <GameArt game={g} className="tile-art" />
              {runningId === g.id && <span className="tile-badge">Em execução</span>}
              {downloads.has(g.id) ? (
                <>
                  <span className="tile-badge">{Math.floor(downloads.get(g.id)!.progress * 100)}%</span>
                  <span className="tile-progress" style={{ width: `${downloads.get(g.id)!.progress * 100}%` }} />
                </>
              ) : (
                !g.folder && (
                  <span className="tile-badge muted">{shelf === 'upcoming' ? 'Em breve' : 'Não instalado'}</span>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {game && (
        <section className="hero" key={game.id}>
          <h1 className="hero-title">{game.title}</h1>
          <div className="hero-actions">
            <button
              className={`play-btn ${runningId === game.id ? 'running' : ''}`}
              disabled={
                runningId !== game.id &&
                (!(game.folder || game.source !== 'folder') ||
                  !(game.exePath || game.launchUri || game.installerPath) ||
                  !!dl)
              }
              onClick={() => onLaunch(game)}
            >
              {runningId === game.id
                ? 'Voltar ao jogo'
                : dl
                  ? `Baixando ${Math.floor(dl.progress * 100)}%`
                  : !game.folder
                    ? game.source !== 'folder'
                      ? `Instalar na ${game.source === 'steam' ? 'Steam' : 'Epic'}`
                      : shelf === 'upcoming'
                      ? 'Em breve'
                      : 'Não instalado'
                    : game.exePath || game.launchUri
                      ? 'Jogar'
                      : game.installerPath
                        ? 'Instalar'
                        : 'Sem executável'}
            </button>
            <span className="hero-meta">
              {dl
                ? formatDownload(dl)
                : game.folder
                  ? [SOURCE_LABEL[game.source], formatPlaytime(game.totalSeconds)].filter(Boolean).join(' · ')
                  : shelf === 'upcoming'
                    ? `Lança em ${formatReleaseDate(game.releaseDate)}`
                    : [game.releaseYear, game.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
            </span>
          </div>
        </section>
      )}

      <ButtonHints
        hints={[
          ...(runningId != null ? [{ button: '○' as const, label: 'Voltar ao jogo' }] : []),
          { button: '✕', label: 'Jogar' },
          { button: '△', label: 'Detalhes' },
          { button: '□', label: 'Adicionar jogo' },
          { button: 'OPTIONS', label: 'Configurações' }
        ]}
      />
    </main>
  )
}
