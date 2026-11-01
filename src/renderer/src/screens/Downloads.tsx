import { useEffect, useRef, useState } from 'react'
import type { DownloadInfo, DownloadsStatus } from '@shared/types'
import { ButtonHints, type Hint } from '../components/ButtonHints'
import { formatBytes, formatDownload } from '../format'
import { useInputMode } from '../input/mode'
import { useInput } from '../input/useInput'
import { downloadsSummary, sortDownloads } from '../library/downloads'

interface Props {
  status: DownloadsStatus
  active: boolean
  /** Row to start on (a game picked on the Home's "Baixando" shelf). */
  initialHash: string | null
  onTab(dir: -1 | 1): void
  onBack(): void
  onSettings(): void
  notify(message: string): void
}

const stateText = (d: DownloadInfo) => (d.state === 'done' ? 'Concluído' : formatDownload(d))

/** qBittorrent downloads into the games folder: progress, pause/resume and cancel, all from the pad. */
export function Downloads({ status, active, initialHash, onTab, onBack, onSettings, notify }: Props) {
  const items = sortDownloads(status.items)
  const [selHash, setSelHash] = useState<string | null>(initialHash)
  /** Hash armed for cancelling: □ again confirms, anything else disarms. */
  const [armed, setArmed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const mode = useInputMode()

  // Follow the row by hash: the list re-sorts as states change and rows come and go.
  const found = items.findIndex((d) => d.hash === selHash)
  const sel = found >= 0 ? found : 0
  const current = items[sel] ?? null

  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sel])

  const run = async (job: () => Promise<{ ok: boolean; error?: string; value?: unknown }>, done?: string) => {
    setBusy(true)
    const res = await job()
    setBusy(false)
    if (!res.ok) return notify(res.error ?? 'Falhou')
    const msg = typeof res.value === 'string' ? res.value : done
    if (msg) notify(msg)
  }

  useInput((a) => {
    if (a !== 'secondary') setArmed(null)
    if (a === 'pageLeft') return onTab(-1)
    if (a === 'pageRight') return onTab(1)
    if (a === 'back') return onBack()
    if (a === 'options') return onSettings()
    if (a === 'up' || a === 'down') {
      const next = items[Math.max(0, Math.min(items.length - 1, sel + (a === 'up' ? -1 : 1)))]
      if (next) setSelHash(next.hash)
      return
    }
    if (!current || busy) return
    if (a === 'confirm' && current.state !== 'done') {
      const pause = current.state !== 'paused'
      void run(() => window.api.pauseDownload(current.hash, pause), pause ? 'Download pausado' : 'Download retomado')
    }
    if (a === 'secondary') {
      if (armed !== current.hash) return setArmed(current.hash)
      setArmed(null)
      void run(() => window.api.cancelDownload(current.hash))
    }
  }, active)

  const { active: count, progress } = downloadsSummary(status.items)
  const hints: Hint[] = current
    ? [
        ...(current.state !== 'done'
          ? [{ button: '✕' as const, label: current.state === 'paused' ? 'Retomar' : 'Pausar' }]
          : []),
        { button: '□', label: armed === current.hash ? 'Confirmar cancelamento' : 'Cancelar download' },
        { button: '○', label: 'Voltar' }
      ]
    : [{ button: '○', label: 'Voltar' }]

  return (
    <main className="downloads">
      <header className="downloads-head">
        <h1>Downloads</h1>
        {count > 0 && (
          <span className="muted">
            {count} {count === 1 ? 'ativo' : 'ativos'} · {Math.floor(progress * 100)}%
          </span>
        )}
      </header>

      {!status.available ? (
        <p className="downloads-empty">
          qBittorrent não está conectado. Abra o qBittorrent com a Interface Web ligada e confira a pasta de jogos
          em Configurações.
        </p>
      ) : items.length === 0 ? (
        <p className="downloads-empty">Nenhum download na pasta de jogos.</p>
      ) : (
        <ul className="dl-list" ref={listRef}>
          {items.map((d, i) => (
            <li
              key={d.hash}
              className={`dl ${d.state} ${i === sel ? 'focused' : ''}`}
              onClick={() => {
                setSelHash(d.hash)
                setArmed(null)
              }}
            >
              <div className="dl-body">
                <strong>{d.title}</strong>
                <div className="progress small">
                  <span style={{ width: `${d.progress * 100}%` }} />
                </div>
                <span className="muted">{stateText(d)}</span>
              </div>
              <span className="dl-size muted">{d.size > 0 ? formatBytes(d.size) : ''}</span>
            </li>
          ))}
        </ul>
      )}

      {armed && armed === current?.hash && (
        <p className="dl-confirm">
          Aperte {mode === 'pad' ? '□' : 'S'} de novo para cancelar. Se a pasta só tiver este download, ela vai para
          a Lixeira.
        </p>
      )}
      <ButtonHints hints={hints} />
    </main>
  )
}
