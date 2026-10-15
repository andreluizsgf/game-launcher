import { useEffect, useRef, useState } from 'react'
import type { CatalogHit, Game } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { VirtualKeyboard } from '../components/VirtualKeyboard'
import { useInput } from '../input/useInput'

const COLS = 4
const DEBOUNCE_MS = 500

export type SearchMode = { kind: 'add' } | { kind: 'link'; game: Game }

interface Props {
  mode: SearchMode
  onDone(game: Game): void
  onClose(): void
  notify(msg: string): void
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'results'; hits: CatalogHit[] }

export function Search({ mode, onDone, onClose, notify }: Props) {
  const [query, setQuery] = useState(mode.kind === 'link' ? mode.game.title : '')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [zone, setZone] = useState<'kb' | 'results'>('kb')
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const gridRef = useRef<HTMLDivElement>(null)

  const run = async (q: string) => {
    const text = q.trim()
    if (text.length < 2) return setState({ kind: 'idle' })
    const id = ++seq.current
    setState({ kind: 'loading' })
    const res = await window.api.catalogSearch(text, mode.kind === 'link' ? mode.game.platform : null)
    if (id !== seq.current) return // a newer search superseded this one
    setState(res.ok ? { kind: 'results', hits: res.value } : { kind: 'error', message: res.error })
    setSel(0)
  }

  // Search as you type.
  useEffect(() => {
    const t = setTimeout(() => run(query), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const hits = state.kind === 'results' ? state.hits : []

  const choose = async (hit: CatalogHit) => {
    if (busy) return
    if (mode.kind === 'add' && hit.inLibraryId) return notify('Esse jogo já está na sua lista')
    setBusy(true)
    const res =
      mode.kind === 'add'
        ? await window.api.catalogAdd(hit.igdbId)
        : await window.api.catalogLink(mode.game.id, hit.igdbId)
    setBusy(false)
    if (!res.ok) return notify(res.error)
    notify(mode.kind === 'add' ? `${res.value.title} adicionado` : `Ficha atualizada: ${res.value.title}`)
    onDone(res.value)
  }

  useInput((a) => {
    const col = sel % COLS
    if (a === 'back' || a === 'details') setZone('kb')
    else if (a === 'left') col === 0 ? setZone('kb') : setSel(sel - 1)
    else if (a === 'right') setSel(Math.min(hits.length - 1, sel + 1))
    else if (a === 'up') setSel(Math.max(col, sel - COLS))
    else if (a === 'down') setSel(Math.min(hits.length - 1, sel + COLS))
    else if (a === 'confirm' && hits[sel]) choose(hits[sel])
  }, zone === 'results')

  useEffect(() => {
    const card = gridRef.current?.children[sel] as HTMLElement | undefined
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sel])

  const enterResults = () => {
    if (hits.length) setZone('results')
  }

  return (
    <div className="overlay search-screen">
      <div className="search">
        <aside className="search-left">
          <h1>{mode.kind === 'add' ? 'Adicionar jogo' : `Identificar "${mode.game.title}"`}</h1>
          <div className={`field ${zone === 'kb' ? 'active' : ''}`} onClick={() => setZone('kb')}>
            {query || <span className="placeholder">Nome do jogo</span>}
            {zone === 'kb' && <span className="caret" />}
          </div>
          <VirtualKeyboard
            value={query}
            onChange={setQuery}
            onSubmit={() => (hits.length ? enterResults() : run(query))}
            onExitRight={enterResults}
            onBack={onClose}
            onActivate={() => setZone('kb')}
            active={zone === 'kb'}
          />
        </aside>

        <section className="search-results">
          {state.kind === 'idle' && <p className="muted">Digite pelo menos 2 letras.</p>}
          {state.kind === 'loading' && <p className="muted">Buscando…</p>}
          {state.kind === 'error' && <p className="error">{state.message}</p>}
          {state.kind === 'results' && hits.length === 0 && <p className="muted">Nada encontrado.</p>}
          <div className="result-grid" ref={gridRef}>
            {hits.map((h, i) => (
              <div
                key={h.igdbId}
                className={`result ${zone === 'results' && i === sel ? 'focused' : ''}`}
                onClick={() => {
                  setZone('results')
                  setSel(i)
                  choose(h)
                }}
              >
                <div className="result-cover">
                  {h.coverUrl ? <img src={h.coverUrl} alt="" draggable={false} /> : <span>{h.name[0]}</span>}
                  {h.inLibraryId && <span className="tile-badge">Na lista</span>}
                </div>
                <div className="result-name">{h.name}</div>
                <div className="result-year">{h.year ?? '—'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <ButtonHints
        hints={
          zone === 'kb'
            ? [
                { button: '✕', label: 'Digitar' },
                { button: '□', label: 'Apagar' },
                { button: 'R2', label: 'Resultados' },
                { button: '○', label: 'Fechar' }
              ]
            : [
                { button: '✕', label: mode.kind === 'add' ? 'Adicionar' : 'Usar esta ficha' },
                { button: '○', label: 'Teclado' }
              ]
        }
      />
    </div>
  )
}
