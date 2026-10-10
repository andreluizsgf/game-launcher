import type Database from 'better-sqlite3'
import type { Game, InputMode, ScanResult } from '@shared/types'
import { titlesMatch } from '@shared/titleKey'
import type { ScannedGame } from '../library/scanner'

interface GameRow {
  id: number
  folder: string | null
  title: string
  exe_path: string | null
  exe_override: string | null
  cover_path: string | null
  art_path: string | null
  igdb_id: number | null
  summary: string | null
  release_year: number | null
  genres: string
  added_at: number
  last_played_at: number | null
  total_seconds: number
  hidden: number
  input_mode: InputMode
}

export interface CatalogMeta {
  igdbId: number
  title: string
  summary: string | null
  releaseYear: number | null
  genres: string[]
  coverPath: string | null
  artPath: string | null
}

const toGame = (r: GameRow): Game => ({
  id: r.id,
  folder: r.folder,
  title: r.title,
  exePath: r.exe_path,
  exeOverride: r.exe_override,
  coverPath: r.cover_path,
  artPath: r.art_path,
  igdbId: r.igdb_id,
  summary: r.summary,
  releaseYear: r.release_year,
  genres: JSON.parse(r.genres) as string[],
  addedAt: r.added_at,
  lastPlayedAt: r.last_played_at,
  totalSeconds: r.total_seconds,
  hidden: !!r.hidden,
  inputMode: r.input_mode
})

export class GamesRepo {
  constructor(private db: Database.Database) {}

  /** Installed first (most recently played first), then catalog-only games. */
  list(): Game[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM games WHERE hidden = 0
         ORDER BY folder IS NULL, last_played_at IS NULL, last_played_at DESC, title COLLATE NOCASE`
      )
      .all() as GameRow[]
    return rows.map(toGame)
  }

  get(id: number): Game | null {
    const row = this.db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined
    return row ? toGame(row) : null
  }

  byIgdbId(igdbId: number): Game | null {
    const row = this.db.prepare('SELECT * FROM games WHERE igdb_id = ?').get(igdbId) as GameRow | undefined
    return row ? toGame(row) : null
  }

  /** Installed game without catalog link whose title matches — candidate for merging a catalog add. */
  findUnlinkedInstalled(title: string): Game | null {
    const rows = this.db
      .prepare('SELECT * FROM games WHERE folder IS NOT NULL AND igdb_id IS NULL AND hidden = 0')
      .all() as GameRow[]
    const hit = rows.find((r) => titlesMatch(r.title, title))
    return hit ? toGame(hit) : null
  }

  /**
   * Incremental sync: keeps ids/playtime of known folders, hides missing ones, and
   * attaches new folders to matching not-installed catalog games.
   */
  sync(scanned: ScannedGame[]): ScanResult {
    const rows = this.db.prepare('SELECT * FROM games').all() as GameRow[]
    const byFolder = new Map(rows.filter((r) => r.folder).map((r) => [r.folder!, r]))
    const pending = rows.filter((r) => !r.folder)

    const insert = this.db.prepare(
      'INSERT INTO games (folder, title, exe_path, cover_path, added_at) VALUES (?, ?, ?, ?, ?)'
    )
    // Catalog art wins over a folder cover.jpg only when the game has catalog art.
    const update = this.db.prepare(
      'UPDATE games SET exe_path = ?, cover_path = COALESCE(?, cover_path), hidden = 0 WHERE id = ?'
    )
    const install = this.db.prepare(
      'UPDATE games SET folder = ?, exe_path = ?, cover_path = COALESCE(cover_path, ?) WHERE id = ?'
    )
    const hide = this.db.prepare('UPDATE games SET hidden = 1 WHERE id = ?')
    const seen = new Set<string>()
    let added = 0
    let updated = 0
    let removed = 0

    this.db.transaction(() => {
      for (const g of scanned) {
        seen.add(g.folder)
        const row = byFolder.get(g.folder)
        if (row) {
          update.run(g.exePath, row.igdb_id ? null : g.coverPath, row.id)
          updated++
          continue
        }
        const idx = pending.findIndex((p) => titlesMatch(p.title, g.title))
        if (idx >= 0) {
          install.run(g.folder, g.exePath, g.coverPath, pending[idx].id)
          pending.splice(idx, 1)
          updated++
        } else {
          insert.run(g.folder, g.title, g.exePath, g.coverPath, Date.now())
          added++
        }
      }
      for (const [folder, row] of byFolder) {
        if (!seen.has(folder) && !row.hidden) {
          hide.run(row.id)
          removed++
        }
      }
    })()

    return { added, updated, removed, total: scanned.length }
  }

  addCatalog(meta: CatalogMeta): Game {
    const res = this.db
      .prepare(
        `INSERT INTO games (title, igdb_id, summary, release_year, genres, cover_path, art_path, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        meta.title,
        meta.igdbId,
        meta.summary,
        meta.releaseYear,
        JSON.stringify(meta.genres),
        meta.coverPath,
        meta.artPath,
        Date.now()
      )
    return this.get(Number(res.lastInsertRowid))!
  }

  /** Links catalog metadata to an existing game; the catalog name replaces the folder-derived title. */
  applyCatalog(gameId: number, meta: CatalogMeta): Game {
    this.db
      .prepare(
        `UPDATE games SET igdb_id = ?, summary = ?, release_year = ?, genres = ?,
           cover_path = COALESCE(?, cover_path), art_path = COALESCE(?, art_path), title = ?
         WHERE id = ?`
      )
      .run(
        meta.igdbId,
        meta.summary,
        meta.releaseYear,
        JSON.stringify(meta.genres),
        meta.coverPath,
        meta.artPath,
        meta.title,
        gameId
      )
    return this.get(gameId)!
  }

  /** Only catalog-only games can be removed; installed ones come back on rescan anyway. */
  removeCatalog(gameId: number): boolean {
    const res = this.db.prepare('DELETE FROM games WHERE id = ? AND folder IS NULL').run(gameId)
    return res.changes > 0
  }

  startSession(gameId: number, startedAt: number): number {
    const res = this.db
      .prepare('INSERT INTO sessions (game_id, started_at) VALUES (?, ?)')
      .run(gameId, startedAt)
    this.db.prepare('UPDATE games SET last_played_at = ? WHERE id = ?').run(startedAt, gameId)
    return Number(res.lastInsertRowid)
  }

  endSession(sessionId: number, gameId: number, endedAt: number, seconds: number): void {
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE sessions SET ended_at = ?, seconds = ? WHERE id = ?')
        .run(endedAt, seconds, sessionId)
      this.db
        .prepare('UPDATE games SET total_seconds = total_seconds + ? WHERE id = ?')
        .run(seconds, gameId)
    })()
  }
}
