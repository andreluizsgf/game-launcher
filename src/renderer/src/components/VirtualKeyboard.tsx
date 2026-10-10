import { useEffect, useRef, useState } from 'react'
import { inputBus } from '../input/actions'
import { useInput } from '../input/useInput'

const ROWS = ['1234567890', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm-:.'].map((r) => r.split(''))
const SPECIAL = ['Espaço', 'Apagar', 'OK'] as const
const ALL_ROWS: string[][] = [...ROWS, [...SPECIAL]]

interface Props {
  value: string
  onChange(v: string): void
  onSubmit(): void
  /** Called when the user navigates right off the keyboard's last column. */
  onExitRight?(): void
  onBack(): void
  /** Mouse click on a key while inactive (e.g. focus was on search results). */
  onActivate?(): void
  active: boolean
  maxLength?: number
}

/**
 * PS-style on-screen keyboard. D-pad moves, ✕ types, □ deletes, R2 submits.
 * Also accepts physical keyboard typing and paste while mounted.
 */
export function VirtualKeyboard({ value, onChange, onSubmit, onExitRight, onBack, onActivate, active, maxLength = 200 }: Props) {
  const [pos, setPos] = useState({ r: 1, c: 0 })
  // Refs so the physical-keyboard sink (registered once) always sees fresh props.
  const valueRef = useRef(value)
  valueRef.current = value
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Update the ref immediately: a paste types many chars before React re-renders.
  const set = (v: string) => {
    valueRef.current = v
    onChangeRef.current(v)
  }
  const type = (s: string) => set((valueRef.current + s).slice(0, maxLength))
  const del = () => set(valueRef.current.slice(0, -1))

  useEffect(() => {
    if (!active) return
    inputBus.setTextSink((e) => (e.kind === 'char' ? type(e.char) : del()))
    return () => inputBus.setTextSink(null)
  }, [active])

  /** Keeps the horizontal position proportional between rows of different widths. */
  const moveRow = (to: number) =>
    setPos(({ r, c }) => {
      const from = ALL_ROWS[r].length
      const dest = ALL_ROWS[to].length
      return { r: to, c: Math.min(dest - 1, Math.floor(((c + 0.5) * dest) / from)) }
    })

  const press = (key: string) => {
    if (key === 'Espaço') type(' ')
    else if (key === 'Apagar') del()
    else if (key === 'OK') onSubmit()
    else type(key)
  }

  useInput((a) => {
    const row = ALL_ROWS[pos.r]
    if (a === 'up' && pos.r > 0) moveRow(pos.r - 1)
    else if (a === 'down' && pos.r < ALL_ROWS.length - 1) moveRow(pos.r + 1)
    else if (a === 'left') setPos((p) => ({ ...p, c: Math.max(0, p.c - 1) }))
    else if (a === 'right') {
      if (pos.c === row.length - 1) onExitRight?.()
      else setPos((p) => ({ ...p, c: p.c + 1 }))
    } else if (a === 'secondary') del()
    else if (a === 'submit') onSubmit()
    else if (a === 'back') onBack()
    else if (a === 'confirm') press(row[pos.c])
  }, active)

  return (
    <div className={`vkb ${active ? 'active' : ''}`}>
      {ALL_ROWS.map((row, r) => (
        <div key={r} className={`vkb-row ${r === ROWS.length ? 'special' : ''}`}>
          {row.map((k, c) => (
            <button
              key={k}
              className={`vkb-key ${active && pos.r === r && pos.c === c ? 'focused' : ''}`}
              onClick={() => {
                setPos({ r, c })
                onActivate?.()
                press(k)
              }}
            >
              {k}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
