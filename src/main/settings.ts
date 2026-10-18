import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import type { EmulatorId } from '@shared/systems'
import type { Settings } from '@shared/types'
import { detectEmulator } from './emulators/launch'
import { findQbittorrent } from './telegram/qbittorrent'

/** On-disk shape. Secrets (IGDB secret, Telegram hash/session) are encrypted with the OS keychain (safeStorage). */
export interface StoredSettings {
  gamesRoot: string | null
  /** One subfolder per system (ps2, ps3, snes…). */
  romsRoot: string | null
  /** Emulator executables picked by hand; otherwise detected. */
  emulatorPaths: Partial<Record<EmulatorId, string>>
  steamLibrary: boolean
  epicLibrary: boolean
  /** Steam Web API key: lists the account's games that aren't installed. */
  steamApiKeyEnc: string | null
  /** Signed-in Epic account: rotating refresh token (encrypted) and its display name. */
  epicRefreshEnc: string | null
  epicAccountName: string | null
  fullscreen: boolean
  openAtLogin: boolean
  /** The PS menu freezes the running PC game (emulators use their own pause). */
  pauseOnOverlay: boolean
  /** Catalog art fetched with this version of the art rules (see Library.refreshCatalogArt). */
  artVersion: number
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
  romsRoot: null,
  emulatorPaths: {},
  steamLibrary: true,
  epicLibrary: true,
  steamApiKeyEnc: null,
  epicRefreshEnc: null,
  epicAccountName: null,
  fullscreen: false,
  openAtLogin: false,
  pauseOnOverlay: true,
  artVersion: 0,
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
  if (!s.romsRoot && process.env.GL_ROMS_ROOT) s.romsRoot = resolve(process.env.GL_ROMS_ROOT)
  return s
}

export function saveSettings(s: StoredSettings): void {
  writeFileSync(file(), JSON.stringify(s, null, 2))
}

export function publicSettings(s: StoredSettings): Settings {
  return {
    gamesRoot: s.gamesRoot,
    romsRoot: s.romsRoot,
    emulators: {
      retroarch: emulatorPath(s, 'retroarch'),
      pcsx2: emulatorPath(s, 'pcsx2'),
      rpcs3: emulatorPath(s, 'rpcs3')
    },
    steamLibrary: s.steamLibrary,
    epicLibrary: s.epicLibrary,
    hasSteamApiKey: !!s.steamApiKeyEnc,
    epicAccount: s.epicRefreshEnc ? (s.epicAccountName ?? 'Conta Epic') : null,
    fullscreen: s.fullscreen,
    openAtLogin: s.openAtLogin,
    pauseOnOverlay: s.pauseOnOverlay,
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

/** Argument the login item starts the launcher with: forces fullscreen. */
export const AUTOSTART_ARG = '--autostart'

/**
 * Registers/unregisters the launcher as a Windows login item. The portable build runs from a temp
 * copy, so the item points at the original .exe; re-applied on every start because each version's
 * portable file has a new name.
 */
export function applyOpenAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return
  const path = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  app.setLoginItemSettings({ openAtLogin: enabled, path, args: [AUTOSTART_ARG] })
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

/** The emulator picked in Settings, or one found in the usual places. */
export function emulatorPath(s: StoredSettings, id: EmulatorId): string | null {
  const picked = s.emulatorPaths[id]
  if (picked && existsSync(picked)) return picked
  return detectEmulator(id, s.romsRoot)
}
