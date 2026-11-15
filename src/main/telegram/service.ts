import { app, shell } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { Api, TelegramClient } from 'telegram'
import { EditedMessage, type EditedMessageEvent } from 'telegram/events/EditedMessage'
import { NewMessage, type NewMessageEvent } from 'telegram/events/NewMessage'
import { LogLevel } from 'telegram/extensions/Logger'
import { StringSession } from 'telegram/sessions'
import { getPeerId } from 'telegram/Utils'
import type { TgDownloadProgress, TgLoginStep, TgMessage, TgSystem, TgThread } from '@shared/types'
import { decrypt, encrypt, saveSettings, type StoredSettings } from '../settings'
import type { QbWebApi } from '../downloads/qbWebApi'
import { systemRomsDir } from '../emulators/romsDir'
import { addToQbittorrent, findQbittorrent } from './qbittorrent'
import {
  describeFile,
  extractButtons,
  extractCommands,
  gameFolderName,
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
  /** Which chat it went to; decides where the download is saved. */
  system: TgSystem
  /** Peer id of that chat: only its replies belong to the thread. */
  peerId: string
  /** Game title the query was made for; names the folder the download goes into. */
  title: string
  /** Catalog id, so a download can add the game to the library. */
  igdbId: number | null
  query: string
  sentAt: number
  /** Last time anything was sent for this thread (query or command); replies are accepted after it. */
  lastSentAt: number
  /** A /download was requested: the next .torrent that arrives is downloaded and opened automatically. */
  awaitingTorrent: boolean
  raw: Map<number, Api.Message>
}

interface Events {
  thread(t: TgThread): void
  progress(p: TgDownloadProgress): void
  /** A torrent for this game was handed to the torrent client. */
  downloadStarted(game: { title: string; igdbId: number | null; system: TgSystem }): void
}

export class TelegramService {
  private client: TelegramClient | null = null
  private connecting: Promise<TelegramClient> | null = null
  /** Resolved chats by configured name; display names need a dialog lookup, so it's done once. */
  private peers = new Map<string, Api.TypeInputPeer>()
  private threads = new Map<string, Thread>()
  /** Thread currently receiving replies. */
  private active: Thread | null = null
  private login: { client: TelegramClient; phone: string; phoneCodeHash: string } | null = null

  constructor(
    private settings: StoredSettings,
    private qbWeb: QbWebApi,
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
    this.peers.clear()
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

  private async peer(c: TelegramClient, system: TgSystem): Promise<Api.TypeInputPeer> {
    const name = system === 'ps2' ? this.settings.telegramPs2Peer : this.settings.telegramPeer
    if (!name) {
      throw new Error(`Defina o canal/bot do Telegram${system === 'ps2' ? ' para PS2' : ''} em Configurações`)
    }
    const known = this.peers.get(name)
    if (known) return known
    const input = await this.resolvePeer(c, name)
    this.peers.set(name, input)
    return input
  }

  /** Username or t.me link first; otherwise a chat in the account's dialogs with that exact title. */
  private async resolvePeer(c: TelegramClient, name: string): Promise<Api.TypeInputPeer> {
    if (/^\S+$/.test(name)) {
      try {
        return await c.getInputEntity(name)
      } catch {
        // Not a username: maybe the chat's display name.
      }
    }
    const wanted = name.trim().toLowerCase()
    for await (const d of c.iterDialogs({ limit: 500 })) {
      if (d.title?.trim().toLowerCase() === wanted && d.inputEntity) return d.inputEntity
    }
    throw new Error(`Chat "${name}" não encontrado no Telegram — use o @usuário ou o nome exato da conversa`)
  }

  private onMessage(msg: Api.Message): void {
    const t = this.active
    if (!t || msg.out || Date.now() - t.lastSentAt > LISTEN_MS) return
    if (getPeerId(msg.peerId) !== t.peerId) return
    t.raw.set(msg.id, msg)
    this.events.thread(this.view(t))
    if (t.awaitingTorrent && msg.document && describeFile(msg.file?.name, msg.file?.mimeType, null).torrent) {
      t.awaitingTorrent = false
      this.download(msg.id).catch((err) =>
        this.events.progress({ msgId: msg.id, ratio: 0, error: err instanceof Error ? err.message : String(err) })
      )
    }
  }

  private view(t: Thread): TgThread {
    const messages = [...t.raw.values()].sort((a, b) => a.id - b.id).map(toTgMessage)
    return { system: t.system, query: t.query, sentAt: t.sentAt, messages }
  }

  async query(title: string, force = false, igdbId: number | null = null, system: TgSystem = 'pc'): Promise<TgThread> {
    const text = renderTemplate(this.settings.telegramTemplate, title)
    // Same text can go to both chats: the key keeps the PC and PS2 threads apart.
    const key = `${system}:${text}`
    const prev = this.threads.get(key)
    if (prev && !force && Date.now() - prev.sentAt < REUSE_MS) {
      prev.igdbId ??= igdbId
      this.active = prev
      return this.view(prev)
    }
    const c = await this.connected()
    const peer = await this.peer(c, system)
    const t: Thread = {
      system,
      peerId: getPeerId(peer),
      title,
      igdbId,
      query: text,
      sentAt: Date.now(),
      lastSentAt: Date.now(),
      awaitingTorrent: false,
      raw: new Map()
    }
    this.threads.set(key, t)
    this.active = t
    await c.sendMessage(peer, { message: text })
    return this.view(t)
  }

  private find(msgId: number): { msg: Api.Message; thread: Thread } {
    for (const thread of this.threads.values()) {
      const msg = thread.raw.get(msgId)
      if (msg) return { msg, thread }
    }
    throw new Error('Mensagem não encontrada — busque de novo')
  }

  /**
   * PC: `<games folder>/<game title>`: the torrent's own folder (often a release name like
   * "Control_Resonant_P_RUS_+_ENG") lands inside one the scanner recognizes by title.
   * PS2: straight into the ROMs folder's PS2 subfolder, since the ROM scan only looks one level down.
   */
  private savePathFor(thread: Thread | null): string | null {
    if (thread?.system === 'ps2') return systemRomsDir(this.settings.romsRoot, 'ps2')
    const root = this.settings.gamesRoot
    return root && thread ? join(root, gameFolderName(thread.title)) : root
  }

  async openLink(url: string): Promise<'qbittorrent' | 'default'> {
    if (!isOpenable(url)) throw new Error('Link não suportado')
    if (/^magnet:/i.test(url)) {
      const via = await this.openTorrent(url, this.active)
      return via === 'qbittorrent' ? via : 'default'
    }
    await shell.openExternal(url)
    return 'default'
  }

  async download(msgId: number): Promise<string> {
    const { msg, thread } = this.find(msgId)
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
    const savePath = this.savePathFor(thread)
    const openedWith = info.torrent ? await this.openTorrent(path, thread) : 'folder'
    if (openedWith === 'folder') shell.showItemInFolder(path)
    this.events.progress({ msgId, ratio: 1, openedWith, savePath })
    return path
  }

  /** qBittorrent saving into `savePath` when installed; the OS default handler otherwise. */
  private async openTorrent(torrent: string, thread: Thread | null): Promise<'qbittorrent' | 'default' | 'folder'> {
    const via = await this.sendToClient(torrent, this.savePathFor(thread))
    if (via !== 'folder' && thread)
      this.events.downloadStarted({ title: thread.title, igdbId: thread.igdbId, system: thread.system })
    return via
  }

  /**
   * qBittorrent Web API first (honors the folder even with automatic torrent management on), then its
   * command line, then whatever handles .torrent/magnet on the system.
   */
  private async sendToClient(torrent: string, savePath: string | null): Promise<'qbittorrent' | 'default' | 'folder'> {
    try {
      await this.qbWeb.add(torrent, savePath)
      return 'qbittorrent'
    } catch {
      // Web UI off: try the executable.
    }
    const qb = findQbittorrent(this.settings.qbittorrentPath)
    if (qb) {
      try {
        await addToQbittorrent(qb, torrent, savePath)
        return 'qbittorrent'
      } catch {
        // Fall through to the default handler.
      }
    }
    if (torrent.startsWith('magnet:')) {
      await shell.openExternal(torrent)
      return 'default'
    }
    return (await shell.openPath(torrent)) ? 'folder' : 'default'
  }

  async command(command: string): Promise<void> {
    const t = this.active
    if (!t) throw new Error('Busque o jogo de novo')
    if (!isBotCommand(command)) throw new Error('Comando inválido')
    const c = await this.connected()
    t.lastSentAt = Date.now()
    if (command.startsWith('/download')) t.awaitingTorrent = true
    await c.sendMessage(await this.peer(c, t.system), { message: command })
  }

  async press(msgId: number, row: number, col: number): Promise<void> {
    const { msg } = this.find(msgId)
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
