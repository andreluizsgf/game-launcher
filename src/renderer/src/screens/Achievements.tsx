import { useEffect, useRef, useState } from 'react'
import type { Achievement, GameAchievements } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { formatDate, mediaUrl } from '../format'
import { useInput } from '../input/useInput'

interface Props {
  title: string
  data: GameAchievements
  onClose(): void
}

/** Newest unlocks first, then locked ones from most to least common (the next ones to go for). */
export function sortAchievements(list: Achievement[]): Achievement[] {
  return [...list].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
    if (a.unlocked) return (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)
    return (b.rarity ?? -1) - (a.rarity ?? -1)
  })
}

const iconUrl = (icon: string | null) => (!icon ? null : /^https?:/i.test(icon) ? icon : mediaUrl(icon))
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 })}%`

export function Achievements({ title, data, onClose }: Props) {
  const list = sortAchievements(data.list)
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sel])

  useInput((a) => {
    if (a === 'back' || a === 'details') return onClose()
    if (a === 'up' || a === 'left') setSel((s) => Math.max(0, s - 1))
    if (a === 'down' || a === 'right') setSel((s) => Math.min(list.length - 1, s + 1))
    if (a === 'pageLeft') setSel((s) => Math.max(0, s - 8))
    if (a === 'pageRight') setSel((s) => Math.min(list.length - 1, s + 8))
  })

  return (
    <div className="overlay top">
      <div className="ach-panel">
        <h2>
          Conquistas <span className="muted">· {title}</span>
        </h2>
        <div className="ach-summary">
          <span>
            {data.unlocked} de {data.total} · {pct((data.unlocked / Math.max(1, data.total)) * 100)}
          </span>
          <div className="progress">
            <span style={{ width: `${(data.unlocked / Math.max(1, data.total)) * 100}%` }} />
          </div>
        </div>
        <ul className="ach-list" ref={listRef}>
          {list.map((a, i) => {
            const secret = a.hidden && !a.unlocked
            const icon = iconUrl(a.icon)
            return (
              <li
                key={a.id || i}
                className={`ach ${a.unlocked ? 'unlocked' : 'locked'} ${i === sel ? 'focused' : ''}`}
                onClick={() => setSel(i)}
              >
                {icon ? (
                  <img src={icon} alt="" draggable={false} loading="lazy" />
                ) : (
                  <span className="ach-icon">🏆</span>
                )}
                <div className="ach-body">
                  <strong>{secret ? 'Conquista oculta' : a.name}</strong>
                  <span className="muted">{secret ? 'Continue jogando para descobrir.' : a.description}</span>
                  {a.progress && !a.unlocked && (
                    <div className="progress small">
                      <span style={{ width: `${(a.progress.current / a.progress.max) * 100}%` }} />
                    </div>
                  )}
                </div>
                <div className="ach-meta">
                  {a.unlocked ? (
                    <span>{a.unlockedAt ? formatDate(a.unlockedAt) : 'Desbloqueada'}</span>
                  ) : a.progress ? (
                    <span>
                      {a.progress.current}/{a.progress.max}
                    </span>
                  ) : null}
                  {a.rarity != null && <span className="muted">{pct(a.rarity)} dos jogadores</span>}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="settings-note">Dados do {data.source}.</p>
      </div>
      <ButtonHints hints={[{ button: '○', label: 'Voltar' }]} />
    </div>
  )
}
