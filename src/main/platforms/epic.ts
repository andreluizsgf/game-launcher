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
