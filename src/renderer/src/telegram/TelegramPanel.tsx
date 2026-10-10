import { useEffect, useRef, useState } from 'react'
import type { TgMessage } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { useInput } from '../input/useInput'
import type { TgState } from './useTelegramThread'

interface Props {
  title: string
  peer: string | null
  state: TgState
  onResend(): void
  onClose(): void
}

type Action =
  | { kind: 'link'; msgId: number; label: string; url: string; magnet: boolean }
  | { kind: 'file'; msgId: number; label: string; torrent: boolean }
  | { kind: 'press'; msgId: number; label: string; row: number; col: number }

function actionsOf(m: TgMessage): Action[] {
  return [
    ...(m.file ? [{ kind: 'file' as const, msgId: m.id, label: m.file.name, torrent: m.file.torrent }] : []),
    ...m.links.map((l) => ({ kind: 'link' as const, msgId: m.id, label: l.label, url: l.url, magnet: l.magnet })),
    ...m.buttons.map((b) => ({ kind: 'press' as const, msgId: m.id, label: b.label, row: b.row, col: b.col }))
  ]
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

const ICON: Record<string, string> = { torrent: '🧲', file: '⬇', magnet: '🧲', link: '↗', press: '›' }

/** Replies from the Telegram peer for one game, with their links, files and bot buttons. */
export function TelegramPanel({ title, peer, state, onResend, onClose }: Props) {
  const messages = state.status === 'ready' ? state.thread.messages : []
  let offset = 0
  const groups = messages.map((m) => {
    const acts = actionsOf(m)
    const g = { m, acts, start: offset }
    offset += acts.length
    return g
  })
  const actions = groups.flatMap((g) => g.acts)
  const [sel, setSel] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<number, number>>({})
  const listRef = useRef<HTMLDivElement>(null)
  const focused = actions[Math.min(sel, actions.length - 1)]

  useEffect(() => window.api.onTelegramProgress((p) => setProgress((s) => ({ ...s, [p.msgId]: p.ratio }))), [])

  useEffect(() => {
    listRef.current?.querySelector('.tg-action.focused')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sel, actions.length])

  const run = async (a: Action | undefined) => {
    if (!a) return
    setNote(null)
    if (a.kind === 'link') {
      const res = await window.api.telegramOpenLink(a.url)
      setNote(res.ok ? (a.magnet ? 'Magnet enviado ao cliente de torrent' : 'Aberto no navegador') : res.error)
    } else if (a.kind === 'file') {
      if (progress[a.msgId] !== undefined && progress[a.msgId] < 1) return
      setProgress((s) => ({ ...s, [a.msgId]: 0 }))
      const res = await window.api.telegramDownload(a.msgId)
      if (!res.ok) {
        setProgress(({ [a.msgId]: _, ...rest }) => rest)
        setNote(res.error)
      } else setNote(a.torrent ? 'Torrent aberto no cliente padrão' : `Salvo em ${res.value}`)
    } else {
      const res = await window.api.telegramPress(a.msgId, a.row, a.col)
      if (!res.ok) setNote(res.error)
    }
  }

  useInput((a) => {
    if (a === 'back') return onClose()
    if (a === 'secondary') return onResend()
    if (a === 'up' || a === 'left') setSel((s) => Math.max(0, Math.min(s, actions.length - 1) - 1))
    if (a === 'down' || a === 'right') setSel((s) => Math.min(actions.length - 1, s + 1))
    if (a === 'confirm') run(focused)
  })

  const status =
    state.status === 'sending'
      ? `Enviando "${title}"…`
      : state.status === 'error'
        ? state.error
        : state.status === 'ready' && messages.length === 0
          ? `Aguardando resposta de @${peer ?? '?'}…`
          : null

  return (
    <div className="overlay top">
      <div className="tg-panel">
        <h2>
          Telegram <span className="muted">· {title}</span>
        </h2>
        {status && <p className={`tg-status ${state.status === 'error' ? 'error' : ''}`}>{status}</p>}
        <div className="tg-list" ref={listRef}>
          {groups.map(({ m, acts, start }) => (
            <div key={m.id} className="tg-msg">
              {m.text && <p className="tg-text">{m.text}</p>}
              {acts.length > 0 && (
                <div className="tg-actions">
                  {acts.map((a, k) => {
                      const i = start + k
                      const icon = a.kind === 'file' ? (a.torrent ? 'torrent' : 'file') : a.kind === 'link' ? (a.magnet ? 'magnet' : 'link') : 'press'
                      const p = a.kind === 'file' ? progress[a.msgId] : undefined
                      const size = a.kind === 'file' ? formatSize(m.file?.size ?? null) : ''
                      return (
                        <button
                          key={i}
                          className={`tg-action ${focused === a ? 'focused' : ''}`}
                          onClick={() => {
                            setSel(i)
                            run(a)
                          }}
                        >
                          <span className="tg-icon">{ICON[icon]}</span>
                          <span className="tg-label">{a.label}</span>
                          {size && <span className="muted">{size}</span>}
                          {p !== undefined && <span className="muted">{p >= 1 ? '✓' : `${Math.round(p * 100)}%`}</span>}
                        </button>
                      )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        {note && <p className="tg-status">{note}</p>}
      </div>
      <ButtonHints
        hints={[
          { button: '✕', label: 'Abrir / baixar' },
          { button: '□', label: 'Buscar de novo' },
          { button: '○', label: 'Voltar' }
        ]}
      />
    </div>
  )
}
