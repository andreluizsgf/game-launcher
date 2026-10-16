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
    // Paste (Ctrl/Cmd+V) into the open text field — handy for API keys. Read on keydown: macOS never fires
    // a `paste` event here because no editable element has focus.
    if (sink && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault()
      window.api.readClipboard().then((text) => {
        // The field may have closed while the clipboard was read.
        const target = inputBus.textSink
        if (target) for (const char of text.replace(/[\r\n]+/g, '')) target({ kind: 'char', char })
      })
      return
    }
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
    // Tab / Shift+Tab: next / previous Home shelf (the R2 / L2 of the keyboard).
    const tab = e.key === 'Tab' && !sink ? (e.shiftKey ? 'triggerLeft' : 'submit') : undefined
    const a = tab ?? NAV_KEYS[e.key] ?? (sink ? undefined : LETTER_KEYS[e.key.toLowerCase()])
    if (!a) return
    e.preventDefault()
    inputBus.emit(a)
  }
  window.addEventListener('keydown', onKey)
  return () => {
    window.removeEventListener('keydown', onKey)
  }
}
