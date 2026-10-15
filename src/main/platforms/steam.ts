import { execFile } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseVdf, type Vdf } from './vdf'

export interface PlatformGame {
  externalId: string
  title: string
  /** null = owned but not installed; launchUri then opens the store's install dialog. */
  folder: string | null
  exePath: string | null
  /** Store launch/install link; null for emulated games (launched through their emulator). */
  launchUri: string | null
  /** Emulated games: system id. */
  platform?: string
  /** Store artwork, when the store hands it out. */
  art?: { cover: string | null; wide: string | null }
}

/** Not games: shared runtimes Steam installs alongside them. */
const NOT_GAMES = /redistributable|steamworks common|proton|steam linux runtime|steamvr/i
const STATE_FULLY_INSTALLED = 4

function steamRootFromRegistry(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(out)
      resolve(m ? m[1].trim().replace(/\//g, '\\') : null)
    })
  })
}

export async function findSteamRoot(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const candidates = [await steamRootFromRegistry(), 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']
  return candidates.find((p): p is string => !!p && existsSync(join(p, 'steamapps'))) ?? null
}

/** Library roots listed in steamapps/libraryfolders.vdf (the Steam folder itself included). */
export function libraryPaths(steamRoot: string, vdfText: string | null): string[] {
  const out = new Set<string>([steamRoot])
  if (vdfText) {
    const lf = parseVdf(vdfText).libraryfolders
    if (lf && typeof lf === 'object') {
      for (const entry of Object.values(lf)) {
        // Current format: { "path": "D:\\SteamLibrary", ... }; old format: "1" "D:\\SteamLibrary".
        const p = typeof entry === 'string' ? entry : typeof entry.path === 'string' ? entry.path : null
        if (p) out.add(p)
      }
    }
  }
  return [...out]
}

/** One appmanifest_<id>.acf → game, or null for runtimes and incomplete installs. */
export function parseAppManifest(text: string, library: string): PlatformGame | null {
  const app = parseVdf(text).appstate as Vdf | undefined
  if (!app || typeof app !== 'object') return null
  const { appid, name, installdir, stateflags } = app as Record<string, string>
  if (!appid || !name || !installdir) return null
  if (!(Number(stateflags) & STATE_FULLY_INSTALLED) || NOT_GAMES.test(name)) return null
  return {
    externalId: appid,
    title: name,
    folder: join(library, 'steamapps', 'common', installdir),
    exePath: null,
    launchUri: `steam://rungameid/${appid}`
  }
}

/** Installed Steam games across every library folder. */
export async function scanSteam(): Promise<PlatformGame[]> {
  const root = await findSteamRoot()
  if (!root) return []
  const read = (p: string) => {
    try {
      return readFileSync(p, 'utf8')
    } catch {
      return null
    }
  }
  const games: PlatformGame[] = []
  for (const lib of libraryPaths(root, read(join(root, 'steamapps', 'libraryfolders.vdf')))) {
    const apps = join(lib, 'steamapps')
    let files: string[] = []
    try {
      files = readdirSync(apps).filter((f) => /^appmanifest_\d+\.acf$/i.test(f))
    } catch {
      continue
    }
    for (const f of files) {
      const text = read(join(apps, f))
      const g = text && parseAppManifest(text, lib)
      if (g && !games.some((x) => x.externalId === g.externalId)) games.push(g)
    }
  }
  return games
}

/** SteamID64 of the account last signed in on this PC (config/loginusers.vdf). */
export function steamIdFromLoginUsers(text: string): string | null {
  const users = parseVdf(text).users
  if (!users || typeof users !== 'object') return null
  const ids = Object.keys(users).filter((id) => /^\d{17}$/.test(id))
  const recent = ids.find((id) => {
    const u = users[id]
    return typeof u === 'object' && u.mostrecent === '1'
  })
  return recent ?? ids[0] ?? null
}

export async function findSteamId(): Promise<string | null> {
  const root = await findSteamRoot()
  if (!root) return null
  try {
    return steamIdFromLoginUsers(readFileSync(join(root, 'config', 'loginusers.vdf'), 'utf8'))
  } catch {
    return null
  }
}

interface OwnedResponse {
  response?: { games?: Array<{ appid: number; name?: string }> }
}

/** GetOwnedGames payload → not-installed games (installed ones come from the manifests). */
export function parseOwnedGames(body: OwnedResponse): PlatformGame[] {
  return (body.response?.games ?? [])
    .filter((g) => g.name && !NOT_GAMES.test(g.name))
    .map((g) => ({
      externalId: String(g.appid),
      title: g.name!,
      folder: null,
      exePath: null,
      launchUri: `steam://install/${g.appid}`
    }))
}

/**
 * Every game on the Steam account, through the Web API (the key's owner sees their own library even
 * when the profile is private). Throws when Steam can't be reached, so the caller keeps what it had.
 */
export async function ownedSteamGames(apiKey: string): Promise<PlatformGame[]> {
  const steamId = await findSteamId()
  if (!steamId) throw new Error('Nenhuma conta Steam encontrada neste PC')
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/')
  url.search = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    include_appinfo: '1',
    include_played_free_games: '1'
  }).toString()
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (res.status === 401 || res.status === 403) throw new Error('Steam Web API key inválida')
  if (!res.ok) throw new Error(`Steam respondeu ${res.status}`)
  return parseOwnedGames((await res.json()) as OwnedResponse)
}

/** Steam CDN artwork for an app id. */
export const steamArt = (appid: string) => ({
  cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900_2x.jpg`,
  art: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`
})
