import { inputBus, type Action } from '../input/actions'
import { useInputMode } from '../input/mode'

export type Hint = { button: '✕' | '○' | '△' | '□' | 'R2' | 'OPTIONS'; label: string }

const PAD: Record<Hint['button'], { glyph: string; cls: string; action: Action }> = {
  '✕': { glyph: '✕', cls: 'cross', action: 'confirm' },
  '○': { glyph: '○', cls: 'circle', action: 'back' },
  '△': { glyph: '△', cls: 'triangle', action: 'details' },
  '□': { glyph: '□', cls: 'square', action: 'secondary' },
  R2: { glyph: 'R2', cls: 'opt', action: 'submit' },
  OPTIONS: { glyph: 'OPTIONS', cls: 'opt', action: 'options' }
}

/**
 * The four face-button shapes, drawn rather than typed: ✕ ○ △ □ come from different fallback fonts with
 * different sizes and baselines, so as text they never sit centered in the ring. Same 14-unit box and
 * stroke for all; the triangle is nudged down to look centered (its visual center is below its box's).
 */
const SHAPES: Partial<Record<Hint['button'], JSX.Element>> = {
  '✕': <path d="M3 3l8 8M11 3l-8 8" />,
  '○': <circle cx="7" cy="7" r="4.6" />,
  '△': <path d="M7 3.1l5 8.6H2z" />,
  '□': <rect x="2.6" y="2.6" width="8.8" height="8.8" rx="0.6" />
}

function Glyph({ button }: { button: Hint['button'] }) {
  const p = PAD[button]
  const shape = SHAPES[button]
  return (
    <span className={`btn-glyph ${p.cls}`}>
      {shape ? (
        <svg className="btn-shape" viewBox="0 0 14 14" aria-label={p.glyph}>
          {shape}
        </svg>
      ) : (
        p.glyph
      )}
    </span>
  )
}

/** Keyboard equivalents — must match keyboard.ts. */
const KEYS: Record<Hint['button'], string> = {
  '✕': 'Enter',
  '○': 'Esc',
  '△': 'T',
  '□': 'S',
  R2: 'Enter',
  OPTIONS: 'O'
}

/** Footer hints. Glyphs follow the last-used device; each hint is also clickable. */
export function ButtonHints({ hints }: { hints: Hint[] }) {
  const mode = useInputMode()
  return (
    <footer className="hints">
      {hints.map((h) => {
        const p = PAD[h.button]
        return (
          <button key={h.button + h.label} className="hint" onClick={() => inputBus.emit(p.action)}>
            {mode === 'pad' ? (
              <Glyph button={h.button} />
            ) : (
              <span className="btn-glyph key">{KEYS[h.button]}</span>
            )}
            {h.label}
          </button>
        )
      })}
    </footer>
  )
}
