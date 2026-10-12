import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { PlatformGame } from './steam'

export const EPIC_MANIFESTS = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

interface EpicItem {
  DisplayName?: string
  InstallLocation?: string
  LaunchExecutable?: string
  AppName?: string
  MainGameAppName?: string
  CatalogNamespace?: string
  CatalogItemId?: string
  AppCategories?: string[]
  bIsIncompleteInstall?: boolean
}

/** One .item manifest → game, or null for DLC/add-ons, plugins and unfinished installs. */
export function parseEpicItem(text: string): PlatformGame | null {
  let it: EpicItem
  try {
    it = JSON.parse(text)
  } catch {
    return null
  }
  const { DisplayName, InstallLocation, AppName, CatalogNamespace, CatalogItemId } = it
  if (!DisplayName || !InstallLocation || !AppName || !CatalogNamespace || !CatalogItemId) return null
  if (it.bIsIncompleteInstall) return null
  if (it.AppCategories && !it.AppCategories.includes('games')) return null
  if (it.MainGameAppName && it.MainGameAppName !== AppName) return null
  const id = `${CatalogNamespace}:${CatalogItemId}:${AppName}`
  return {
    externalId: id,
    title: DisplayName,
    folder: InstallLocation,
    exePath: it.LaunchExecutable ? join(InstallLocation, it.LaunchExecutable) : null,
    launchUri: `com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`
  }
}

/** Installed Epic games from the launcher's local manifests. */
export function scanEpic(dir = EPIC_MANIFESTS): PlatformGame[] {
  if (process.platform !== 'win32') return []
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.item'))
  } catch {
    return []
  }
  const games: PlatformGame[] = []
  for (const f of files) {
    try {
      const g = parseEpicItem(readFileSync(join(dir, f), 'utf8'))
      if (g) games.push(g)
    } catch {
      // unreadable manifest: skip
    }
  }
  return games
}

/** The launcher's cache of the account's catalog items (base64-encoded JSON). */
export const epicCatCache = (localAppData = process.env.LOCALAPPDATA ?? '') =>
  join(localAppData, 'EpicGamesLauncher', 'Saved', 'Data', 'Catalog', 'catcache.bin')

interface CatalogItem {
  id?: string
  title?: string
  namespace?: string
  categories?: Array<{ path?: string }>
  keyImages?: Array<{ type?: string; url?: string }>
  releaseInfo?: Array<{ appId?: string; platform?: string[] }>
  mainGameItem?: unknown
}

const image = (it: CatalogItem, ...types: string[]) => {
  for (const t of types) {
    const hit = it.keyImages?.find((k) => k.type === t && k.url)
    if (hit) return hit.url!
  }
  return null
}

/** catcache.bin → the account's games (DLC, add-ons and non-Windows releases left out), with their art. */
export function parseCatCache(content: string): PlatformGame[] {
  let items: CatalogItem[]
  try {
    const text = content.trimStart().startsWith('[') ? content : Buffer.from(content, 'base64').toString('utf8')
    items = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(items)) return []
  const games = new Map<string, PlatformGame>()
  for (const it of items) {
    if (!it.id || !it.title || !it.namespace || it.mainGameItem) continue
    const cats = (it.categories ?? []).map((c) => c.path)
    if (!cats.includes('games') || cats.includes('addons')) continue
    const release = it.releaseInfo?.find((r) => r.appId && (!r.platform || r.platform.includes('Windows')))
    if (!release?.appId) continue
    const id = `${it.namespace}:${it.id}:${release.appId}`
    games.set(id, {
      externalId: id,
      title: it.title,
      folder: null,
      exePath: null,
      launchUri: `com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=install`,
      art: {
        cover: image(it, 'DieselGameBoxTall', 'OfferImageTall', 'Thumbnail'),
        wide: image(it, 'DieselGameBox', 'OfferImageWide')
      }
    })
  }
  return [...games.values()]
}

/** Every game on the Epic account the launcher knows about; null when its cache can't be read. */
export function ownedEpicGames(file = epicCatCache()): PlatformGame[] | null {
  if (process.platform !== 'win32') return []
  try {
    return parseCatCache(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
