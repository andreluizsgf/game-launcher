import { inputBus, type Action } from './actions'
import { setInputMode } from './mode'

const NAV_KEYS: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  PageUp: 'pageLeft',
  PageDown: 'pageRight'
}

/** Single-letter shortcuts, only while no text field is capturing input. Shown in hints (see ButtonHints). */
const LETTER_KEYS: Record<string, Action> = {
  q: 'pageLeft',
  e: 'pageRight',
  t: 'details',
  s: 'secondary',
  o: 'options'
}

export function startKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    setInputMode('keyboard')
    const sink = inputBus.textSink
    if (sink && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Backspace') {
        e.preventDefault()
        return sink({ kind: 'backspace' })
      }
      // Typing physically: Enter confirms the text instead of pressing the focused on-screen key.
      if (e.key === 'Enter') {
        e.preventDefault()
        return inputBus.emit('submit')
      }
      if (e.key.length === 1) {
        e.preventDefault()
        return sink({ kind: 'char', char: e.key })
      }
    }
    const a = NAV_KEYS[e.key] ?? (sink ? undefined : LETTER_KEYS[e.key.toLowerCase()])
    if (!a) return
    e.preventDefault()
    inputBus.emit(a)
  }
  // Paste (Ctrl/Cmd+V) into the open text field — handy for API keys.
  const onPaste = (e: ClipboardEvent) => {
    const sink = inputBus.textSink
    const text = e.clipboardData?.getData('text')
    if (!sink || !text) return
    e.preventDefault()
    for (const char of text.replace(/[\r\n]+/g, '')) sink({ kind: 'char', char })
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('paste', onPaste)
  return () => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('paste', onPaste)
  }
}
