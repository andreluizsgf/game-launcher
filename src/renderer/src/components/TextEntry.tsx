import { useState } from 'react'
import { ButtonHints } from './ButtonHints'
import { VirtualKeyboard } from './VirtualKeyboard'

interface Props {
  title: string
  initial?: string
  secret?: boolean
  hint?: string
  onSubmit(v: string): void
  onCancel(): void
}

/** Full-screen text field with the on-screen keyboard (also accepts typing/paste). */
export function TextEntry({ title, initial = '', secret, hint, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial)
  const shown = secret ? '•'.repeat(value.length) : value
  return (
    <div className="overlay top">
      <div className="text-entry">
        <h2>{title}</h2>
        {hint && <p className="text-entry-hint">{hint}</p>}
        <div className="field">
          {shown}
          <span className="caret" />
        </div>
        <VirtualKeyboard
          value={value}
          onChange={setValue}
          onSubmit={() => onSubmit(value)}
          onBack={onCancel}
          active
        />
      </div>
      <ButtonHints
        hints={[
          { button: '✕', label: 'Digitar' },
          { button: '□', label: 'Apagar' },
          { button: 'R2', label: 'Confirmar' },
          { button: '○', label: 'Cancelar' }
        ]}
      />
    </div>
  )
}
