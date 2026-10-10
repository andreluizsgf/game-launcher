export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'confirm'
  | 'back'
  | 'details'
  | 'secondary'
  | 'submit'
  | 'options'
  | 'pageLeft'
  | 'pageRight'

type Handler = (a: Action) => void

/** Physical-keyboard text events, delivered while a text field is open. */
export type TextEvent = { kind: 'char'; char: string } | { kind: 'backspace' }
type TextSink = (e: TextEvent) => void

/** Stack of handlers: only the top-most (most recently mounted, active) screen receives input. */
const stack: Handler[] = []
let textSink: TextSink | null = null

export const inputBus = {
  push(h: Handler): () => void {
    stack.push(h)
    return () => {
      const i = stack.lastIndexOf(h)
      if (i >= 0) stack.splice(i, 1)
    }
  },
  emit(a: Action): void {
    stack[stack.length - 1]?.(a)
  },
  setTextSink(sink: TextSink | null): void {
    textSink = sink
  },
  get textSink(): TextSink | null {
    return textSink
  }
}
