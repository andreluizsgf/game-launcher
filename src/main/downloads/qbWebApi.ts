import { readFile } from 'fs/promises'
import { basename } from 'path'

/** Subset of qBittorrent's /api/v2/torrents/info entries we use. */
export interface QbTorrent {
  hash: string
  name: string
  /** 0–1 */
  progress: number
  state: string
  /** bytes/s */
  dlspeed: number
  /** seconds; 8640000 = ∞ */
  eta: number
  size: number
  save_path: string
  content_path: string
}

export interface QbWebConfig {
  url: string
  username: string | null
  password: string | null
}

const TIMEOUT_MS = 4000

/**
 * qBittorrent Web UI API (Options → Web UI). With "Bypass authentication for clients on localhost"
 * no credentials are needed; otherwise the Web UI user/password are used.
 */
export class QbWebApi {
  private sid: string | null = null

  constructor(private config: () => QbWebConfig) {}

  private async login(): Promise<void> {
    const { url, username, password } = this.config()
    const res = await fetch(new URL('/api/v2/auth/login', url), {
      method: 'POST',
      body: new URLSearchParams({ username: username ?? '', password: password ?? '' }),
      headers: { Referer: url },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    const text = (await res.text()).trim()
    if (!res.ok || text === 'Fails.')
      throw new Error('qBittorrent recusou o login da Interface Web — confira usuário e senha')
    this.sid = /SID=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? null
  }

  private async request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const { url } = this.config()
    const headers = new Headers(init.headers)
    // The Web UI's CSRF check wants a Referer/Origin matching its host.
    headers.set('Referer', url)
    if (this.sid) headers.set('Cookie', `SID=${this.sid}`)
    const res = await fetch(new URL(path, url), { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 403 && retry) {
      await this.login()
      return this.request(path, init, false)
    }
    if (!res.ok) throw new Error(`qBittorrent respondeu ${res.status}`)
    return res
  }

  async torrents(): Promise<QbTorrent[]> {
    return (await this.request('/api/v2/torrents/info')).json() as Promise<QbTorrent[]>
  }

  /** Adds a .torrent file or magnet with an explicit save path (automatic management off, so it's honored). */
  async add(torrent: string, savePath: string | null): Promise<void> {
    const form = new FormData()
    if (/^magnet:/i.test(torrent)) form.append('urls', torrent)
    else {
      const bytes = await readFile(torrent)
      form.append('torrents', new Blob([bytes], { type: 'application/x-bittorrent' }), basename(torrent))
    }
    if (savePath) form.append('savepath', savePath)
    form.append('autoTMM', 'false')
    form.append('tags', 'game-launcher')
    const res = await this.request('/api/v2/torrents/add', { method: 'POST', body: form })
    if ((await res.text()).trim() === 'Fails.') throw new Error('qBittorrent não aceitou o torrent')
  }
}
