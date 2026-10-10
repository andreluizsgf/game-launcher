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
              <span className={`btn-glyph ${p.cls}`}>{p.glyph}</span>
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
