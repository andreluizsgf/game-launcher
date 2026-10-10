import { useEffect, useRef, type WheelEvent } from 'react'
import type { Game } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { GameArt } from '../components/GameArt'
import { formatPlaytime } from '../format'
import { useInput } from '../input/useInput'

interface Props {
  games: Game[]
  focus: number
  setFocus(i: number): void
  active: boolean
  runningId: number | null
  onLaunch(g: Game): void
  onDetails(g: Game): void
  onSettings(): void
  onSearch(): void
  onTab(dir: -1 | 1): void
}

export function Home({ games, focus, setFocus, active, runningId, onLaunch, onDetails, onSettings, onSearch, onTab }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const game = games[focus] ?? null
  const clamp = (i: number) => Math.max(0, Math.min(games.length - 1, i))

  useInput((a) => {
    if (a === 'options') return onSettings()
    if (a === 'secondary') return onSearch()
    if (a === 'pageLeft') return onTab(-1)
    if (a === 'pageRight') return onTab(1)
    if (!game) return
    if (a === 'left') setFocus(clamp(focus - 1))
    else if (a === 'right') setFocus(clamp(focus + 1))
    else if (a === 'confirm') onLaunch(game)
    else if (a === 'details' || a === 'down') onDetails(game)
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

  if (games.length === 0) {
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
              {!g.folder && <span className="tile-badge muted">Não instalado</span>}
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
              disabled={!game.folder || !game.exePath}
              onClick={() => onLaunch(game)}
            >
              {runningId === game.id
                ? 'Em execução'
                : !game.folder
                  ? 'Não instalado'
                  : game.exePath
                    ? 'Jogar'
                    : 'Sem executável'}
            </button>
            <span className="hero-meta">
              {game.folder ? formatPlaytime(game.totalSeconds) : [game.releaseYear, game.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
            </span>
          </div>
        </section>
      )}

      <ButtonHints
        hints={[
          { button: '✕', label: 'Jogar' },
          { button: '△', label: 'Detalhes' },
          { button: '□', label: 'Adicionar jogo' },
          { button: 'OPTIONS', label: 'Configurações' }
        ]}
      />
    </main>
  )
}
