import { useState } from 'react'
import type { Settings as S } from '@shared/types'
import { ButtonHints } from '../components/ButtonHints'
import { TextEntry } from '../components/TextEntry'
import { useInput } from '../input/useInput'

interface Props {
  settings: S
  onPickRoot(): void
  onRescan(): void
  onToggleFullscreen(): void
  onSetIgdbClientId(v: string): void
  onSetIgdbSecret(v: string): void
  onClose(): void
}

type Editing = null | 'clientId' | 'secret'

export function Settings(props: Props) {
  const { settings, onPickRoot, onRescan, onToggleFullscreen, onSetIgdbClientId, onSetIgdbSecret, onClose } = props
  const [editing, setEditing] = useState<Editing>(null)
  const items = [
    { label: 'Pasta de jogos', value: settings.gamesRoot ?? 'Não definida', run: onPickRoot },
    { label: 'Reescanear biblioteca', value: '', run: onRescan, disabled: !settings.gamesRoot },
    { label: 'Tela cheia', value: settings.fullscreen ? 'Ligado' : 'Desligado', run: onToggleFullscreen },
    { label: 'IGDB Client ID', value: settings.igdbClientId ?? 'Não definido', run: () => setEditing('clientId') },
    { label: 'IGDB Client Secret', value: settings.hasIgdbSecret ? '••••••••' : 'Não definido', run: () => setEditing('secret') }
  ]
  const [sel, setSel] = useState(0)

  useInput((a) => {
    if (a === 'back' || a === 'options') return onClose()
    if (a === 'up') setSel((s) => Math.max(0, s - 1))
    if (a === 'down') setSel((s) => Math.min(items.length - 1, s + 1))
    if (a === 'confirm' && !items[sel].disabled) items[sel].run()
  }, editing === null)

  return (
    <div className="overlay">
      <div className="settings">
        <h1>Configurações</h1>
        <ul>
          {items.map((it, i) => (
            <li
              key={it.label}
              className={`setting ${i === sel ? 'focused' : ''} ${it.disabled ? 'disabled' : ''}`}
              onClick={() => {
                setSel(i)
                if (!it.disabled) it.run()
              }}
            >
              <span>{it.label}</span>
              <span className="setting-value">{it.value}</span>
            </li>
          ))}
        </ul>
        <p className="settings-note">
          A busca de jogos usa o IGDB. Crie um app gratuito em dev.twitch.tv/console (OAuth Redirect:
          http://localhost, categoria Application Integration) e cole aqui o Client ID e o Secret. O secret fica
          criptografado no cofre do sistema.
        </p>
      </div>
      {editing && (
        <TextEntry
          title={editing === 'clientId' ? 'IGDB Client ID' : 'IGDB Client Secret'}
          initial={editing === 'clientId' ? (settings.igdbClientId ?? '') : ''}
          secret={editing === 'secret'}
          hint="Dá pra colar com Ctrl+V."
          onSubmit={(v) => {
            if (editing === 'clientId') onSetIgdbClientId(v)
            else onSetIgdbSecret(v)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      <ButtonHints
        hints={[
          { button: '✕', label: 'Selecionar' },
          { button: '○', label: 'Voltar' }
        ]}
      />
    </div>
  )
}
