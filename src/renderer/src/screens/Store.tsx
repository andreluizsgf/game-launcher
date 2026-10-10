import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoreGame, StoreSection } from '@shared/types'
import type { BackdropArt } from '../components/Background'
import { ButtonHints } from '../components/ButtonHints'
import { formatReleaseDate, ratingTone } from '../format'
import { useInput } from '../input/useInput'

const HERO_COUNT = 5
const HERO_ROTATE_MS = 9000

interface Props {
  active: boolean
  /** Bumped by the parent after the library changes, to refresh "Na lista" badges. */
  libraryVersion: number
  onOpen(g: StoreGame): void
  onTab(dir: -1 | 1): void
  onSettings(): void
  onSearch(): void
  onBackdrop(art: BackdropArt | null): void
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; sections: StoreSection[] }

export function Store({ active, libraryVersion, onOpen, onTab, onSettings, onSearch, onBackdrop }: Props) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  // row 0 = hero banner, rows 1..n = sections
  const [row, setRow] = useState(0)
  const [cols, setCols] = useState<number[]>([])
  const [hero, setHero] = useState(0)
  const rowsRef = useRef<HTMLDivElement>(null)
  const lastInput = useRef(Date.now())

  const fetchSections = useCallback(async (force = false) => {
    const res = await window.api.storeSections(force)
    setLoad(res.ok ? { kind: 'ready', sections: res.value } : { kind: 'error', message: res.error })
  }, [])

  useEffect(() => {
    fetchSections()
  }, [fetchSections, libraryVersion])

  const sections = load.kind === 'ready' ? load.sections : []
  // Featured: first trending games that have wide artwork.
  const featured = (sections[0]?.games ?? []).filter((g) => g.artUrl).slice(0, HERO_COUNT)
  const heroGame = featured[hero % Math.max(1, featured.length)] ?? null
  const col = (r: number) => cols[r] ?? 0
  const focused: StoreGame | null = row === 0 ? heroGame : (sections[row - 1]?.games[col(row)] ?? null)

  // Auto-rotate the banner while the user isn't touching it.
  useEffect(() => {
    if (!active || featured.length < 2) return
    const t = setInterval(() => {
      if (row === 0 && Date.now() - lastInput.current < HERO_ROTATE_MS) return
      setHero((h) => (h + 1) % featured.length)
    }, HERO_ROTATE_MS)
    return () => clearInterval(t)
  }, [active, featured.length, row])

  useEffect(() => {
    if (!active) return
    onBackdrop(
      focused ? { key: `store-${focused.igdbId}`, url: focused.artUrl ?? focused.coverUrl, wide: !!focused.artUrl, seed: focused.name } : null
    )
  }, [active, focused?.igdbId])

  // Keep the focused row in view.
  useEffect(() => {
    const el = rowsRef.current?.querySelector<HTMLElement>(`[data-row="${row}"]`)
    el?.scrollIntoView({ block: row === 0 ? 'end' : 'center', behavior: 'smooth' })
    const card = el?.querySelector<HTMLElement>('.store-card.focused')
    card?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [row, cols])

  useInput((a) => {
    lastInput.current = Date.now()
    if (a === 'pageLeft') return onTab(-1)
    if (a === 'pageRight') return onTab(1)
    if (a === 'options') return onSettings()
    if (a === 'secondary') return onSearch()
    if (load.kind === 'error' && a === 'confirm') return fetchSections(true)
    const rowCount = sections.length + 1
    if (a === 'up') setRow((r) => Math.max(0, r - 1))
    else if (a === 'down') setRow((r) => Math.min(rowCount - 1, r + 1))
    else if (a === 'left' || a === 'right') {
      const d = a === 'left' ? -1 : 1
      if (row === 0) setHero((h) => (featured.length ? (h + d + featured.length) % featured.length : 0))
      else {
        const len = sections[row - 1]?.games.length ?? 0
        setCols((c) => {
          const next = [...c]
          next[row] = Math.max(0, Math.min(len - 1, col(row) + d))
          return next
        })
      }
    } else if ((a === 'confirm' || a === 'details') && focused) onOpen(focused)
  }, active)

  if (load.kind !== 'ready') {
    return (
      <main className="store empty" style={{ display: active ? undefined : 'none' }}>
        {load.kind === 'loading' ? (
          <p className="muted">Carregando a loja…</p>
        ) : (
          <>
            <h1>Loja indisponível</h1>
            <p className="error">{load.message}</p>
          </>
        )}
        <ButtonHints
          hints={[
            ...(load.kind === 'error' ? [{ button: '✕' as const, label: 'Tentar de novo' }] : []),
            { button: 'OPTIONS', label: 'Configurações' }
          ]}
        />
      </main>
    )
  }

  return (
    <main className="store" style={{ display: active ? undefined : 'none' }}>
      <div className="store-rows" ref={rowsRef}>
        {heroGame && (
          <section data-row={0} className={`store-hero ${row === 0 ? 'focused' : ''}`}>
            <div className="store-hero-body" key={heroGame.igdbId}>
              <span className="store-kicker">Em destaque</span>
              <h1>{heroGame.name}</h1>
              <p className="store-hero-meta">
                {heroGame.rating != null && <span className={`rating ${ratingTone(heroGame.rating)}`}>{heroGame.rating}</span>}
                {[heroGame.year, heroGame.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
              </p>
              {heroGame.summary && <p className="store-hero-summary">{heroGame.summary}</p>}
              <button className={`play-btn ${row === 0 ? '' : 'dim'}`} onClick={() => onOpen(heroGame)}>
                {heroGame.inLibraryId ? 'Na sua lista' : 'Ver jogo'}
              </button>
            </div>
            <div className="store-dots">
              {featured.map((g, i) => (
                <span
                  key={g.igdbId}
                  className={i === hero % featured.length ? 'on' : ''}
                  onClick={() => {
                    lastInput.current = Date.now()
                    setRow(0)
                    setHero(i)
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {sections.map((s, i) => {
          const r = i + 1
          return (
            <section key={s.id} data-row={r} className={`store-section ${row === r ? 'focused' : ''}`}>
              <h2>{s.title}</h2>
              <div className="store-strip">
                {s.games.map((g, c) => (
                  <div
                    key={g.igdbId}
                    className={`store-card ${row === r && col(r) === c ? 'focused' : ''}`}
                    onClick={() => {
                      setRow(r)
                      setCols((cs) => Object.assign([...cs], { [r]: c }))
                      onOpen(g)
                    }}
                  >
                    <div className="store-cover">
                      {g.coverUrl ? <img src={g.coverUrl} alt="" draggable={false} loading="lazy" /> : null}
                      {g.inLibraryId && <span className="tile-badge">Na lista</span>}
                    </div>
                    <div className="store-card-name">{g.name}</div>
                    <div className="store-card-meta">
                      {s.id === 'upcoming' ? (
                        formatReleaseDate(g.releaseDate)
                      ) : g.rating != null ? (
                        <span className={`rating small ${ratingTone(g.rating)}`}>{g.rating}</span>
                      ) : (
                        (g.year ?? '')
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <ButtonHints
        hints={[
          { button: '✕', label: 'Ver jogo' },
          { button: '□', label: 'Buscar' },
          { button: 'OPTIONS', label: 'Configurações' }
        ]}
      />
    </main>
  )
}
