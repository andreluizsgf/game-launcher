import { useEffect, useState } from 'react'
import type { StorageInfo } from '@shared/types'
import { formatBytes } from '../format'
import type { PadStatus } from '../input/gamepad'
import { useInputMode } from '../input/mode'

export type Tab = 'games' | 'store'
const TABS: { id: Tab; label: string }[] = [
  { id: 'games', label: 'Jogos' },
  { id: 'store', label: 'Loja' }
]

interface Props {
  pad: PadStatus
  storage: StorageInfo | null
  tab: Tab
  onTab(t: Tab): void
}

/** Below this share of free space the indicator turns red. */
const LOW_SPACE = 0.1

export function TopBar({ pad, storage, tab, onTab }: Props) {
  const mode = useInputMode()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(t)
  }, [])
  const idx = TABS.findIndex((t) => t.id === tab)
  return (
    <header className="topbar">
      <nav className="topbar-tabs">
        <button className="topbar-shoulder" onClick={() => onTab(TABS[Math.max(0, idx - 1)].id)}>
          {mode === 'pad' ? 'L1' : 'Q'}
        </button>
        {TABS.map((t) => (
          <button key={t.id} className={`topbar-tab ${t.id === tab ? 'active' : ''}`} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
        <button className="topbar-shoulder" onClick={() => onTab(TABS[Math.min(TABS.length - 1, idx + 1)].id)}>
          {mode === 'pad' ? 'R1' : 'E'}
        </button>
      </nav>
      <div className="topbar-right">
        {storage && storage.total > 0 && (
          <span
            className={`storage ${storage.free / storage.total < LOW_SPACE ? 'low' : ''}`}
            title={`${storage.label} · ${formatBytes(storage.free)} livres de ${formatBytes(storage.total)}`}
          >
            <span className="storage-bar">
              <span style={{ width: `${(1 - storage.free / storage.total) * 100}%` }} />
            </span>
            {formatBytes(storage.free)} livres
          </span>
        )}
        <span className={`pad-dot ${pad.connected ? 'on' : ''}`} title={pad.name ?? 'Sem controle'} />
        <time>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
    </header>
  )
}
