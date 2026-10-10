import { app, shell } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { Api, TelegramClient } from 'telegram'
import { EditedMessage, type EditedMessageEvent } from 'telegram/events/EditedMessage'
import { NewMessage, type NewMessageEvent } from 'telegram/events/NewMessage'
import { LogLevel } from 'telegram/extensions/Logger'
import { StringSession } from 'telegram/sessions'
import { getPeerId } from 'telegram/Utils'
import type { TgDownloadProgress, TgLoginStep, TgMessage, TgThread } from '@shared/types'
import { decrypt, encrypt, saveSettings, type StoredSettings } from '../settings'
import {
  describeFile,
  extractButtons,
  extractCommands,
  extractLinks,
  isBotCommand,
  isNoResults,
  isOpenable,
  renderTemplate,
  safeFileName,
  type RawButton
} from './parse'

/** Replies arriving this long after the query are still attributed to it. */
const LISTEN_MS = 3 * 60_000
/** A thread younger than this is reused instead of messaging the peer again. */
const REUSE_MS = 30 * 60_000

interface Thread {
  query: string
  sentAt: number
  /** Last time anything was sent for this thread (query or command); replies are accepted after it. */
  lastSentAt: number
  raw: Map<number, Api.Message>
}

interface Events {
  thread(t: TgThread): void
  progress(p: TgDownloadProgress): void
}

export class TelegramService {
  private client: TelegramClient | null = null
  private connecting: Promise<TelegramClient> | null = null
  private peerId: string | null = null
  private threads = new Map<string, Thread>()
  /** Thread currently receiving replies. */
  private active: Thread | null = null
  private login: { client: TelegramClient; phone: string; phoneCodeHash: string } | null = null

  constructor(
    private settings: StoredSettings,
    private events: Events
  ) {}

  private credentials(): { apiId: number; apiHash: string } {
    const apiId = this.settings.telegramApiId
    const apiHash = decrypt(this.settings.telegramApiHashEnc)
    if (!apiId || !apiHash) throw new Error('Configure o API ID e o API Hash do Telegram')
    return { apiId, apiHash }
  }

  private newClient(session: string): TelegramClient {
    const { apiId, apiHash } = this.credentials()
    const c = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3 })
    c.setLogLevel(LogLevel.ERROR)
    return c
  }

  /** Drops the live connection, e.g. after credentials or the peer change. */
  async reset(): Promise<void> {
    const c = this.client
    this.client = null
    this.connecting = null
    this.peerId = null
    this.threads.clear()
    this.active = null
    await c?.disconnect().catch(() => {})
  }

  private async connected(): Promise<TelegramClient> {
    if (this.client) return this.client
    this.connecting ??= (async () => {
      const session = decrypt(this.settings.telegramSessionEnc)
      if (!session) throw new Error('Entre na sua conta do Telegram em Configurações')
      const c = this.newClient(session)
      await c.connect()
      if (!(await c.checkAuthorization())) {
        await c.disconnect().catch(() => {})
        this.settings.telegramSessionEnc = null
        saveSettings(this.settings)
        throw new Error('Sessão do Telegram expirou — entre de novo em Configurações')
      }
      c.addEventHandler((e: NewMessageEvent) => this.onMessage(e.message), new NewMessage({}))
      c.addEventHandler((e: EditedMessageEvent) => this.onMessage(e.message), new EditedMessage({}))
      this.client = c
      return c
    })().finally(() => (this.connecting = null))
    return this.connecting
  }

  private async peer(c: TelegramClient): Promise<Api.TypeInputPeer> {
    const name = this.settings.telegramPeer
    if (!name) throw new Error('Defina o canal/bot do Telegram em Configurações')
    const input = await c.getInputEntity(name)
    this.peerId = getPeerId(input)
    return input
  }

  private onMessage(msg: Api.Message): void {
    const t = this.active
    if (!t || !this.peerId || msg.out || Date.now() - t.lastSentAt > LISTEN_MS) return
    if (getPeerId(msg.peerId) !== this.peerId) return
    t.raw.set(msg.id, msg)
    this.events.thread(this.view(t))
  }

  private view(t: Thread): TgThread {
    const messages = [...t.raw.values()].sort((a, b) => a.id - b.id).map(toTgMessage)
    return { query: t.query, sentAt: t.sentAt, messages }
  }

  async query(title: string, force = false): Promise<TgThread> {
    const text = renderTemplate(this.settings.telegramTemplate, title)
    const prev = this.threads.get(text)
    if (prev && !force && Date.now() - prev.sentAt < REUSE_MS) {
      this.active = prev
      return this.view(prev)
    }
    const c = await this.connected()
    const peer = await this.peer(c)
    const t: Thread = { query: text, sentAt: Date.now(), lastSentAt: Date.now(), raw: new Map() }
    this.threads.set(text, t)
    this.active = t
    await c.sendMessage(peer, { message: text })
    return this.view(t)
  }

  private find(msgId: number): Api.Message {
    for (const t of this.threads.values()) {
      const m = t.raw.get(msgId)
      if (m) return m
    }
    throw new Error('Mensagem não encontrada — busque de novo')
  }

  async openLink(url: string): Promise<void> {
    if (!isOpenable(url)) throw new Error('Link não suportado')
    await shell.openExternal(url)
  }

  async download(msgId: number): Promise<string> {
    const msg = this.find(msgId)
    const c = await this.connected()
    const f = msg.file
    if (!f) throw new Error('Mensagem sem arquivo')
    const info = describeFile(f.name, f.mimeType, toNumber(f.size))
    const dir = join(app.getPath('downloads'), 'Game Launcher')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${msgId}-${safeFileName(info.name)}`)
    const total = info.size ?? 0
    await c.downloadMedia(msg, {
      outputFile: path,
      progressCallback: (done) =>
        total && this.events.progress({ msgId, ratio: Math.min(0.99, toNumber(done)! / total) })
    })
    this.events.progress({ msgId, ratio: 1 })
    if (info.torrent) {
      const err = await shell.openPath(path)
      if (err) shell.showItemInFolder(path)
    } else shell.showItemInFolder(path)
    return path
  }

  async command(command: string): Promise<void> {
    const t = this.active
    if (!t) throw new Error('Busque o jogo de novo')
    if (!isBotCommand(command)) throw new Error('Comando inválido')
    const c = await this.connected()
    t.lastSentAt = Date.now()
    await c.sendMessage(await this.peer(c), { message: command })
  }

  async press(msgId: number, row: number, col: number): Promise<void> {
    const msg = this.find(msgId)
    await this.connected()
    await msg.click({ i: row, j: col })
  }

  async loginPhone(phone: string): Promise<TgLoginStep> {
    await this.login?.client.disconnect().catch(() => {})
    const client = this.newClient('')
    await client.connect()
    const { phoneCodeHash } = await client.sendCode(this.credentials(), phone.replace(/[^\d+]/g, ''))
    this.login = { client, phone, phoneCodeHash }
    return 'code'
  }

  async loginCode(code: string): Promise<TgLoginStep> {
    const l = this.login
    if (!l) throw new Error('Comece pelo número de telefone')
    try {
      const res = await l.client.invoke(
        new Api.auth.SignIn({ phoneNumber: l.phone, phoneCodeHash: l.phoneCodeHash, phoneCode: code.trim() })
      )
      if (res instanceof Api.auth.AuthorizationSignUpRequired) throw new Error('Esse número não tem conta no Telegram')
    } catch (err) {
      if (err instanceof Error && err.message.includes('SESSION_PASSWORD_NEEDED')) return 'password'
      throw err
    }
    return this.finishLogin()
  }

  async loginPassword(password: string): Promise<TgLoginStep> {
    const l = this.login
    if (!l) throw new Error('Comece pelo número de telefone')
    // GramJS swallows the real error (e.g. PASSWORD_HASH_INVALID) behind AUTH_USER_CANCEL.
    const seen: { err?: Error } = {}
    try {
      await l.client.signInWithPassword(this.credentials(), {
        password: async () => password,
        onError: async (err) => {
          seen.err = err
          return true
        }
      })
    } catch (err) {
      throw seen.err ?? err
    }
    return this.finishLogin()
  }

  private async finishLogin(): Promise<TgLoginStep> {
    const l = this.login!
    this.login = null
    this.settings.telegramSessionEnc = encrypt((l.client.session as StringSession).save())
    saveSettings(this.settings)
    await l.client.disconnect().catch(() => {})
    await this.reset()
    return 'done'
  }

  async logout(): Promise<void> {
    try {
      const c = await this.connected()
      await c.invoke(new Api.auth.LogOut())
    } catch {
      // Session already dead or offline: forgetting it locally is enough.
    }
    this.settings.telegramSessionEnc = null
    saveSettings(this.settings)
    await this.reset()
  }
}

function toNumber(v: unknown): number | null {
  if (v == null) return null
  const n = Number(typeof v === 'object' ? v.toString() : v)
  return Number.isFinite(n) ? n : null
}

function toTgMessage(m: Api.Message): TgMessage {
  const text = m.message ?? ''
  const buttons: RawButton[][] = (m.buttons ?? []).map((row) =>
    row.map((b) => ({ text: b.text, url: b.url, data: b.data }))
  )
  const entities = (m.entities ?? []).map((e) => ({
    className: e.className,
    offset: e.offset,
    length: e.length,
    url: e instanceof Api.MessageEntityTextUrl ? e.url : undefined
  }))
  const f = m.document ? m.file : undefined
  return {
    id: m.id,
    date: m.date * 1000,
    text,
    links: extractLinks(text, entities, buttons),
    file: f ? describeFile(f.name, f.mimeType, toNumber(f.size)) : null,
    buttons: extractButtons(buttons),
    commands: extractCommands(text),
    noResults: isNoResults(text)
  }
}
