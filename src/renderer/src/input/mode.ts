import { useEffect, useState } from 'react'

/** Last device the user touched; drives hint glyphs and cursor visibility. */
export type InputMode = 'pad' | 'keyboard' | 'mouse'

let mode: InputMode = 'keyboard'
const listeners = new Set<(m: InputMode) => void>()

export function setInputMode(m: InputMode): void {
  if (m === mode) return
  mode = m
  document.body.classList.toggle('mouse-mode', m === 'mouse')
  listeners.forEach((l) => l(m))
}

export function useInputMode(): InputMode {
  const [m, setM] = useState(mode)
  useEffect(() => {
    listeners.add(setM)
    return () => {
      listeners.delete(setM)
    }
  }, [])
  return m
}

/** Shows the cursor on real mouse movement (ignores tiny jitter). */
export function startMouseTracking(): () => void {
  let last: { x: number; y: number } | null = null
  const onMove = (e: MouseEvent) => {
    if (last && Math.abs(e.screenX - last.x) + Math.abs(e.screenY - last.y) > 3) setInputMode('mouse')
    last = { x: e.screenX, y: e.screenY }
  }
  const onDown = () => setInputMode('mouse')
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mousedown', onDown)
  return () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mousedown', onDown)
  }
}
