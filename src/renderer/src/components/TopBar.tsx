import { useEffect, useState } from 'react'
import type { StorageInfo } from '@shared/types'
import { formatBytes } from '../format'
import type { PadStatus } from '../input/gamepad'
import { LOW_BATTERY } from '../input/padNotices'
import { useInputMode } from '../input/mode'

export type Tab = 'games' | 'store' | 'downloads'
const TABS: { id: Tab; label: string }[] = [
  { id: 'games', label: 'Jogos' },
  { id: 'store', label: 'Loja' },
  { id: 'downloads', label: 'Downloads' }
]

/** The tab `dir` steps away from `t` (L1/R1), staying put at the ends. */
export function stepTab(t: Tab, dir: -1 | 1): Tab {
  const i = TABS.findIndex((x) => x.id === t)
  return TABS[Math.max(0, Math.min(TABS.length - 1, i + dir))].id
}

interface Props {
  pad: PadStatus
  storage: StorageInfo | null
  /** Title of the game running right now. */
  playing: string | null
  tab: Tab
  onTab(t: Tab): void
  /** Unfinished downloads and their overall progress (0–1), shown on the Downloads tab. */
  downloads: { active: number; progress: number }
}

/** Controller battery: a small battery glyph filled to the level, red when low, a bolt while charging. */
function PadBattery({ level, charging, name }: { level: number; charging: boolean; name: string | null }) {
  const low = !charging && level <= LOW_BATTERY
  return (
    <span
      className={`pad-battery ${low ? 'low' : ''} ${charging ? 'charging' : ''}`}
      title={`${name ?? 'Controle'} · ${level}%${charging ? ' · carregando' : ''}`}
    >
      <svg viewBox="0 0 28 14" aria-hidden="true">
        <rect className="pad-battery-shell" x="0.75" y="0.75" width="23.5" height="12.5" rx="3" />
        <rect className="pad-battery-cap" x="25" y="4.5" width="2.5" height="5" rx="1" />
        <rect className="pad-battery-fill" x="3" y="3" width={(19 * Math.max(level, 5)) / 100} height="8" rx="1.5" />
        {charging && <path className="pad-battery-bolt" d="M13.5 2.2 9.6 7.6h3l-1 4.2 3.9-5.4h-3z" />}
      </svg>
      {level}%
    </span>
  )
}

/** Below this share of free space the indicator turns red. */
const LOW_SPACE = 0.1

export function TopBar({ pad, storage, playing, tab, onTab, downloads }: Props) {
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
            {t.id === 'downloads' && downloads.active > 0 && (
              <span className="tab-badge">
                {downloads.active} · {Math.floor(downloads.progress * 100)}%
              </span>
            )}
          </button>
        ))}
        <button className="topbar-shoulder" onClick={() => onTab(TABS[Math.min(TABS.length - 1, idx + 1)].id)}>
          {mode === 'pad' ? 'R1' : 'E'}
        </button>
      </nav>
      <div className="topbar-right">
        {playing && <span className="now-playing">▶ Jogando {playing}</span>}
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
        {pad.pads.length === 0 ? (
          <span className="pad-dot" title="Sem controle" />
        ) : (
          // One per pad: battery when it's read over HID, otherwise the green dot.
          <span className="pads">
            {pad.pads.map((p, i) =>
              p.battery ? (
                <PadBattery key={i} level={p.battery.level} charging={p.battery.charging} name={p.name} />
              ) : (
                <span key={i} className="pad-dot on" title={p.name} />
              )
            )}
          </span>
        )}
        <time>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
    </header>
  )
}
