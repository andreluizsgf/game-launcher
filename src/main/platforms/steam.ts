import { execFile } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { parseVdf, type Vdf } from './vdf'

export interface PlatformGame {
  externalId: string
  title: string
  folder: string
  exePath: string | null
  launchUri: string
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

/** Steam CDN artwork for an app id. */
export const steamArt = (appid: string) => ({
  cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900_2x.jpg`,
  art: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg`
})
