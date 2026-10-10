import { readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { Achievement, Game, GameAchievements } from '@shared/types'
import { titlesMatch } from '@shared/titleKey'

/**
 * Read-only bridge to Achievement Watcher Next (github.com/Shirowwww/Achievement-Watcher-Next), which
 * already reads achievements from Steam, Epic, GOG, Ubisoft, emulators… and caches its whole library in
 * `cache/library_snapshot/library.json`. Its format is internal (format 2 as of AWN 2026-10); anything
 * unexpected just means "no achievements".
 */

interface AwnItem {
  name?: string
  displayName?: string
  description?: string
  icon?: string
  icongray?: string
  hidden?: boolean | number | string
  Achieved?: boolean | number | string
  UnlockTime?: number | string
  CurProgress?: number
  MaxProgress?: number
  percent?: number | string
}

interface AwnGame {
  appid: string | number
  name: string
  achievement: { total?: number; unlocked?: number; list: AwnItem[] }
}

const SNAPSHOT_FORMAT = 2

export function awnDataDir(appData: string): string {
  return join(appData, 'Achievement Watcher Next')
}

const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'

export function toAchievement(a: AwnItem): Achievement {
  const unlocked = truthy(a.Achieved)
  const at = Number(a.UnlockTime)
  const rarity = Number(a.percent)
  return {
    id: String(a.name ?? a.displayName ?? ''),
    name: a.displayName || a.name || 'Conquista',
    description: a.description || '',
    icon: (unlocked ? a.icon : a.icongray || a.icon) || null,
    hidden: truthy(a.hidden),
    unlocked,
    // AWN stores seconds; 0 = unknown.
    unlockedAt: unlocked && at > 0 ? (at < 1e12 ? at * 1000 : at) : null,
    rarity: Number.isFinite(rarity) && a.percent !== '' && a.percent != null ? rarity : null,
    progress:
      a.MaxProgress && a.MaxProgress > 0
        ? { current: Math.min(a.CurProgress ?? 0, a.MaxProgress), max: a.MaxProgress }
        : null
  }
}

export function toGameAchievements(g: AwnGame): GameAchievements {
  const list = g.achievement.list.map(toAchievement)
  return {
    source: 'Achievement Watcher Next',
    appid: String(g.appid),
    total: list.length,
    unlocked: list.filter((a) => a.unlocked).length,
    list
  }
}

const norm = (p: string) =>
  p
    .replace(/[\\/]+/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()

/** The AWN entry for a library game: its executable inside the game folder, else a title match. */
export function matchAwnGame(game: Game, games: AwnGame[], exeByAppid: Map<string, string>): AwnGame | null {
  if (game.folder) {
    const folder = norm(game.folder) + '/'
    const byExe = games.find((g) => {
      const exe = exeByAppid.get(String(g.appid))
      return exe && norm(exe).startsWith(folder)
    })
    if (byExe) return byExe
  }
  return games.find((g) => titlesMatch(g.name, game.title)) ?? null
}

/** Reads AWN's files on demand, re-parsing only when they change. */
export class AwnReader {
  private cache: { key: string; games: AwnGame[]; exeByAppid: Map<string, string> } | null = null

  constructor(private dataDir: () => string) {}

  private files() {
    const dir = this.dataDir()
    return {
      snapshot: join(dir, 'cache', 'library_snapshot', 'library.json'),
      gameIndex: join(dir, 'cfg', 'gameIndex.json'),
      exeList: join(dir, 'cfg', 'exeList.db')
    }
  }

  private load(): { games: AwnGame[]; exeByAppid: Map<string, string> } {
    const f = this.files()
    const sig = (p: string) => {
      try {
        const s = statSync(p)
        return `${s.size}:${s.mtimeMs}`
      } catch {
        return '-'
      }
    }
    const key = [f.snapshot, f.gameIndex, f.exeList].map(sig).join('|')
    if (this.cache?.key === key) return this.cache
    const readJson = (p: string): unknown => {
      try {
        return JSON.parse(readFileSync(p, 'utf8'))
      } catch {
        return null
      }
    }
    const snap = readJson(f.snapshot) as { format?: number; games?: unknown[] } | null
    const games = (snap?.format === SNAPSHOT_FORMAT && Array.isArray(snap.games) ? snap.games : []).filter(
      (g): g is AwnGame =>
        !!g &&
        typeof g === 'object' &&
        (g as AwnGame).appid != null &&
        typeof (g as AwnGame).name === 'string' &&
        Array.isArray((g as AwnGame).achievement?.list)
    )
    const exeByAppid = new Map<string, string>()
    for (const file of [f.exeList, f.gameIndex]) {
      const rows = readJson(file)
      for (const r of Array.isArray(rows) ? rows : []) {
        const exe = r?.exePath ?? r?.exe
        if (r?.appid != null && typeof exe === 'string' && !exeByAppid.has(String(r.appid)))
          exeByAppid.set(String(r.appid), exe)
      }
    }
    this.cache = { key, games, exeByAppid }
    return this.cache
  }

  available(): boolean {
    return this.load().games.length > 0
  }

  forGame(game: Game): GameAchievements | null {
    const { games, exeByAppid } = this.load()
    const hit = matchAwnGame(game, games, exeByAppid)
    return hit && hit.achievement.list.length ? toGameAchievements(hit) : null
  }
}
