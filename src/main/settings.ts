import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import type { Settings } from '@shared/types'
import { findQbittorrent } from './telegram/qbittorrent'

/** On-disk shape. Secrets (IGDB secret, Telegram hash/session) are encrypted with the OS keychain (safeStorage). */
export interface StoredSettings {
  gamesRoot: string | null
  fullscreen: boolean
  igdbClientId: string | null
  igdbSecretEnc: string | null
  telegramApiId: number | null
  telegramApiHashEnc: string | null
  telegramPeer: string | null
  telegramTemplate: string
  telegramSessionEnc: string | null
  /** Overrides qBittorrent auto-detection. */
  qbittorrentPath: string | null
  qbWebUrl: string
  qbWebUser: string | null
  qbWebPasswordEnc: string | null
}

const DEFAULTS: StoredSettings = {
  gamesRoot: null,
  fullscreen: false,
  igdbClientId: null,
  igdbSecretEnc: null,
  telegramApiId: null,
  telegramApiHashEnc: null,
  telegramPeer: null,
  telegramTemplate: '{title}',
  telegramSessionEnc: null,
  qbittorrentPath: null,
  qbWebUrl: 'http://localhost:8080',
  qbWebUser: null,
  qbWebPasswordEnc: null
}
const file = () => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): StoredSettings {
  let s: StoredSettings
  try {
    s = { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    s = { ...DEFAULTS }
  }
  // Dev convenience: `GL_GAMES_ROOT=fixtures/games npm run dev`
  if (!s.gamesRoot && process.env.GL_GAMES_ROOT) s.gamesRoot = resolve(process.env.GL_GAMES_ROOT)
  return s
}

export function saveSettings(s: StoredSettings): void {
  writeFileSync(file(), JSON.stringify(s, null, 2))
}

export function publicSettings(s: StoredSettings): Settings {
  return {
    gamesRoot: s.gamesRoot,
    fullscreen: s.fullscreen,
    igdbClientId: s.igdbClientId,
    hasIgdbSecret: !!s.igdbSecretEnc || !!process.env.IGDB_CLIENT_SECRET,
    telegramApiId: s.telegramApiId,
    hasTelegramApiHash: !!s.telegramApiHashEnc,
    telegramPeer: s.telegramPeer,
    telegramTemplate: s.telegramTemplate,
    telegramLoggedIn: !!s.telegramSessionEnc,
    qbittorrentPath: findQbittorrent(s.qbittorrentPath),
    qbWebUrl: s.qbWebUrl,
    qbWebUser: s.qbWebUser,
    hasQbWebPassword: !!s.qbWebPasswordEnc
  }
}

export function encrypt(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? safeStorage.encryptString(trimmed).toString('base64') : null
}

export function decrypt(enc: string | null): string | null {
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

export function setIgdbSecret(s: StoredSettings, secret: string): void {
  s.igdbSecretEnc = encrypt(secret)
}

/** Accepts `@name`, `name` or a t.me link. */
export function normalizePeer(value: string): string | null {
  const v = value
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
  return v || null
}

/** Credentials from settings, falling back to IGDB_CLIENT_ID / IGDB_CLIENT_SECRET env vars. */
export function igdbCredentials(s: StoredSettings): { clientId: string; clientSecret: string } | null {
  const clientId = s.igdbClientId || process.env.IGDB_CLIENT_ID
  const clientSecret = s.igdbSecretEnc ? decrypt(s.igdbSecretEnc) : (process.env.IGDB_CLIENT_SECRET ?? null)
  return clientId && clientSecret ? { clientId, clientSecret } : null
}
