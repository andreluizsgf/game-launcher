/** Steam's text KeyValues ("VDF") format: `"key" "value"` pairs and `"key" { ... }` blocks. */
export type Vdf = { [key: string]: string | Vdf }

export function parseVdf(text: string): Vdf {
  let i = 0
  const n = text.length

  const skip = () => {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++
      else if (c === '/' && text[i + 1] === '/') while (i < n && text[i] !== '\n') i++
      else break
    }
  }

  const token = (): string | null => {
    skip()
    if (i >= n) return null
    const c = text[i]
    if (c === '{' || c === '}') {
      i++
      return c
    }
    if (c === '"') {
      i++
      let out = ''
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[i + 1]
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e
          i += 2
        } else out += text[i++]
      }
      i++ // closing quote
      return out
    }
    // Unquoted token (rare).
    const start = i
    while (i < n && !/[\s{}"]/.test(text[i])) i++
    return text.slice(start, i)
  }

  const block = (): Vdf => {
    const obj: Vdf = {}
    for (;;) {
      const key = token()
      if (key === null || key === '}') return obj
      const next = token()
      if (next === null) return obj
      // Keys are case-insensitive in practice ("AppState" vs "appstate"); normalize to lowercase.
      obj[key.toLowerCase()] = next === '{' ? block() : next
    }
  }

  return block()
}
