import { useEffect, useRef, useState } from 'react'
import type { Result, Settings as S, TgLoginStep } from '@shared/types'
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
  onSettings(s: S): void
  notify(msg: string): void
  onClose(): void
}

type Editing = null | 'clientId' | 'secret' | TgField

type TgField = 'tgApiId' | 'tgApiHash' | 'tgPeer' | 'tgTemplate' | 'tgPhone' | 'tgCode' | 'tgPassword'

const TG_ENTRY: Record<TgField, { title: string; hint: string; secret?: boolean }> = {
  tgApiId: { title: 'Telegram API ID', hint: 'Número do app criado em my.telegram.org → API development tools.' },
  tgApiHash: { title: 'Telegram API Hash', hint: 'Dá pra colar com Ctrl+V.', secret: true },
  tgPeer: { title: 'Canal / bot do Telegram', hint: '@usuario ou link t.me — recebe o nome do jogo ao abrir o detalhe.' },
  tgTemplate: { title: 'Mensagem enviada', hint: '{title} vira o nome do jogo. Ex.: /search {title}' },
  tgPhone: { title: 'Seu telefone', hint: 'Com DDI, ex.: +5511999998888. O Telegram vai mandar um código.' },
  tgCode: { title: 'Código do Telegram', hint: 'Chegou no app do Telegram (ou por SMS).' },
  tgPassword: { title: 'Senha de verificação em duas etapas', hint: 'Sua conta tem 2FA ativado.', secret: true }
}

export function Settings(props: Props) {
  const { settings, onPickRoot, onRescan, onToggleFullscreen, onSetIgdbClientId, onSetIgdbSecret, onSettings, notify, onClose } =
    props
  const [editing, setEditing] = useState<Editing>(null)
  const tgReady = !!settings.telegramApiId && settings.hasTelegramApiHash

  const loginStep = async (res: Result<TgLoginStep>) => {
    if (!res.ok) {
      notify(res.error)
      return setEditing(null)
    }
    if (res.value === 'code') return setEditing('tgCode')
    if (res.value === 'password') return setEditing('tgPassword')
    setEditing(null)
    onSettings(await window.api.getSettings())
    notify('Telegram conectado')
  }

  const submitTg = async (field: TgField, v: string) => {
    if (field === 'tgPhone') return loginStep(await window.api.telegramLoginPhone(v))
    if (field === 'tgCode') return loginStep(await window.api.telegramLoginCode(v))
    if (field === 'tgPassword') return loginStep(await window.api.telegramLoginPassword(v))
    setEditing(null)
    if (field === 'tgApiHash') return onSettings(await window.api.setTelegramApiHash(v))
    if (field === 'tgApiId') {
      const id = Number(v.trim())
      if (v.trim() && !Number.isInteger(id)) return notify('API ID precisa ser um número')
      return onSettings(await window.api.setSettings({ telegramApiId: v.trim() ? id : null }))
    }
    if (field === 'tgPeer') return onSettings(await window.api.setSettings({ telegramPeer: v }))
    onSettings(await window.api.setSettings({ telegramTemplate: v }))
  }

  const items = [
    { label: 'Pasta de jogos', value: settings.gamesRoot ?? 'Não definida', run: onPickRoot },
    { label: 'Reescanear biblioteca', value: '', run: onRescan, disabled: !settings.gamesRoot },
    { label: 'Tela cheia', value: settings.fullscreen ? 'Ligado' : 'Desligado', run: onToggleFullscreen },
    { label: 'IGDB Client ID', value: settings.igdbClientId ?? 'Não definido', run: () => setEditing('clientId') },
    { label: 'IGDB Client Secret', value: settings.hasIgdbSecret ? '••••••••' : 'Não definido', run: () => setEditing('secret') },
    { label: 'Telegram API ID', value: settings.telegramApiId?.toString() ?? 'Não definido', run: () => setEditing('tgApiId') },
    { label: 'Telegram API Hash', value: settings.hasTelegramApiHash ? '••••••••' : 'Não definido', run: () => setEditing('tgApiHash') },
    { label: 'Telegram canal / bot', value: settings.telegramPeer ? `@${settings.telegramPeer}` : 'Não definido', run: () => setEditing('tgPeer') },
    { label: 'Telegram mensagem', value: settings.telegramTemplate, run: () => setEditing('tgTemplate') },
    {
      label: 'qBittorrent',
      value: settings.qbittorrentPath ?? 'Não encontrado',
      run: async () => onSettings(await window.api.pickQbittorrent())
    },
    settings.telegramLoggedIn
      ? {
          label: 'Telegram conta',
          value: 'Conectada · sair',
          run: async () => {
            onSettings(await window.api.telegramLogout())
            notify('Telegram desconectado')
          }
        }
      : { label: 'Telegram conta', value: 'Entrar', run: () => setEditing('tgPhone'), disabled: !tgReady }
  ]
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // The list can be taller than the screen: keep the focused row visible when navigating with the pad.
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [sel])

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
        <ul ref={listRef}>
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
              <span className="setting-value">
                {/* bdi: keeps "@" and "/" in place inside the rtl (ellipsis-on-the-left) box */}
                <bdi>{it.value}</bdi>
              </span>
            </li>
          ))}
        </ul>
        <p className="settings-note">
          A busca de jogos usa o IGDB. Crie um app gratuito em dev.twitch.tv/console (OAuth Redirect:
          http://localhost, categoria Application Integration) e cole aqui o Client ID e o Secret. O secret fica
          criptografado no cofre do sistema.
        </p>
        <p className="settings-note">
          Telegram: crie um app em my.telegram.org (API development tools) para obter API ID e Hash, defina o canal ou
          bot e entre com sua conta. Ao abrir o detalhe de um jogo, o nome dele é enviado e as respostas aparecem em
          “Telegram”. Hash e sessão ficam criptografados. Torrents vão pro qBittorrent (detectado automaticamente)
          baixando direto na pasta de jogos.
        </p>
      </div>
      {editing && editing !== 'clientId' && editing !== 'secret' && (
        <TextEntry
          key={editing}
          title={TG_ENTRY[editing].title}
          hint={TG_ENTRY[editing].hint}
          secret={TG_ENTRY[editing].secret}
          initial={
            editing === 'tgApiId'
              ? (settings.telegramApiId?.toString() ?? '')
              : editing === 'tgPeer'
                ? (settings.telegramPeer ?? '')
                : editing === 'tgTemplate'
                  ? settings.telegramTemplate
                  : ''
          }
          onSubmit={(v) => submitTg(editing, v)}
          onCancel={() => setEditing(null)}
        />
      )}
      {(editing === 'clientId' || editing === 'secret') && (
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
