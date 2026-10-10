import type { TgButton, TgCommand, TgFile, TgLink } from '@shared/types'

/** Minimal views of GramJS objects, so parsing stays testable without a client. */
export interface RawEntity {
  className: string
  offset: number
  length: number
  url?: string
}

export interface RawButton {
  text: string
  url?: string
  /** Callback buttons carry data; url/switch-inline buttons don't. */
  data?: unknown
}

const MAGNET_RE = /magnet:\?[^\s<>"']+/gi
const URL_RE = /https?:\/\/[^\s<>"']+/gi

const isMagnet = (url: string) => /^magnet:/i.test(url)

/** Only these schemes are ever handed to the OS. */
export function isOpenable(url: string): boolean {
  return /^(https?:\/\/|magnet:\?)/i.test(url)
}

function shortLabel(url: string): string {
  if (isMagnet(url)) {
    const dn = /[?&]dn=([^&]+)/i.exec(url)?.[1]
    if (dn) {
      try {
        return decodeURIComponent(dn.replace(/\+/g, ' '))
      } catch {
        return dn
      }
    }
    return 'Magnet'
  }
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Links from text entities, bare URLs/magnets in the text and URL buttons, deduplicated in order. */
export function extractLinks(text: string, entities: RawEntity[] = [], buttons: RawButton[][] = []): TgLink[] {
  const out: TgLink[] = []
  const seen = new Set<string>()
  const add = (url: string, label?: string) => {
    url = url.replace(/[).,;!?]+$/, '')
    if (!isOpenable(url) || seen.has(url)) return
    seen.add(url)
    const own = label?.trim()
    out.push({ url, label: own && own !== url ? own : shortLabel(url), magnet: isMagnet(url) })
  }

  for (const e of entities) {
    const slice = text.slice(e.offset, e.offset + e.length)
    if (e.className === 'MessageEntityTextUrl' && e.url) add(e.url, slice)
    else if (e.className === 'MessageEntityUrl') add(/^\w+:/.test(slice) ? slice : `https://${slice}`)
  }
  for (const m of text.matchAll(MAGNET_RE)) add(m[0])
  for (const m of text.matchAll(URL_RE)) add(m[0])
  buttons.forEach((row) => row.forEach((b) => b.url && add(b.url, b.text)))
  return out
}

/** Callback buttons (no URL) — bots use them for pagination and "more" menus. */
export function extractButtons(buttons: RawButton[][] = []): TgButton[] {
  const out: TgButton[] = []
  buttons.forEach((row, r) =>
    row.forEach((b, c) => {
      if (!b.url && b.data !== undefined) out.push({ row: r, col: c, label: b.text })
    })
  )
  return out
}

const DOWNLOAD_RE = /(?:^|\s)(\/download\w+)/

/**
 * Search-bot listings: each result is a title line followed by a line with `/download<id>`
 * (often next to `/cover<id>` and `/readme<id>`). Only the title and the download command are kept.
 */
export function extractCommands(text: string): TgCommand[] {
  const out: TgCommand[] = []
  let title: string | null = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const cmd = DOWNLOAD_RE.exec(line)?.[1]
    if (cmd) {
      const rest = line.replace(/\/\w+/g, '').trim()
      out.push({ command: cmd, label: rest || title || cmd })
      title = null
    } else title = line
  }
  return out
}

/** "❌Torrents encontrados: 0❌" — the search bot's empty answer. */
export function isNoResults(text: string): boolean {
  return /encontrad[oa]s?\s*:\s*0\b/i.test(text)
}

/** Only commands parsed from replies are sent; never arbitrary text. */
export function isBotCommand(text: string): boolean {
  return /^\/\w{1,64}$/.test(text)
}

export function describeFile(
  name: string | null | undefined,
  mime: string | null | undefined,
  size: number | null
): TgFile {
  const n = name?.trim() || 'arquivo'
  return { name: n, size, torrent: /\.torrent$/i.test(n) || mime === 'application/x-bittorrent' }
}

export function renderTemplate(template: string, title: string): string {
  const t = template.trim() || '{title}'
  return t.includes('{title}') ? t.split('{title}').join(title) : `${t} ${title}`
}

/** Strips characters that are invalid in Windows/macOS file names. */
export function safeFileName(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 180) || 'arquivo'
  )
}
