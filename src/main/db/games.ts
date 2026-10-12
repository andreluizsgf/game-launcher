import type Database from 'better-sqlite3'
import type { Game, GameSource, InputMode, ScanResult } from '@shared/types'
import { titlesMatch } from '@shared/titleKey'
import type { ScannedGame } from '../library/scanner'
import type { PlatformGame } from '../platforms/steam'

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
  release_date: number | null
  genres: string
  added_at: number
  last_played_at: number | null
  total_seconds: number
  hidden: number
  input_mode: InputMode
  source: GameSource
  external_id: string | null
  launch_uri: string | null
  installer_path: string | null
}

export interface CatalogMeta {
  igdbId: number
  title: string
  summary: string | null
  releaseYear: number | null
  releaseDate: number | null
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
  releaseDate: r.release_date,
  genres: JSON.parse(r.genres) as string[],
  addedAt: r.added_at,
  lastPlayedAt: r.last_played_at,
  totalSeconds: r.total_seconds,
  hidden: !!r.hidden,
  inputMode: r.input_mode,
  source: r.source,
  externalId: r.external_id,
  launchUri: r.launch_uri,
  installerPath: r.installer_path
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
    const all = this.db.prepare('SELECT * FROM games').all() as GameRow[]
    // Store games are synced by syncPlatform; a games folder that overlaps a store library leaves them alone.
    const platformFolders = new Set(all.filter((r) => r.source !== 'folder' && r.folder).map((r) => r.folder!))
    scanned = scanned.filter((g) => !platformFolders.has(g.folder))
    const rows = all.filter((r) => r.source === 'folder')
    const byFolder = new Map(rows.filter((r) => r.folder).map((r) => [r.folder!, r]))
    const scannedFolders = new Set(scanned.map((g) => g.folder))
    const pending = rows.filter((r) => !r.folder)
    // Rows whose folder is gone: a new folder with the same title is the same game, moved or renamed.
    const moved = rows.filter((r) => r.folder && !scannedFolders.has(r.folder))

    const insert = this.db.prepare(
      'INSERT INTO games (folder, title, exe_path, installer_path, cover_path, added_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    // Catalog art wins over a folder cover.jpg only when the game has catalog art.
    const update = this.db.prepare(
      'UPDATE games SET exe_path = ?, installer_path = ?, cover_path = COALESCE(?, cover_path), hidden = 0 WHERE id = ?'
    )
    const install = this.db.prepare(
      'UPDATE games SET folder = ?, exe_path = ?, installer_path = ?, cover_path = COALESCE(cover_path, ?), hidden = 0 WHERE id = ?'
    )
    // A chosen exe from the old location no longer exists.
    const relocate = this.db.prepare(
      'UPDATE games SET folder = ?, exe_path = ?, installer_path = ?, exe_override = NULL, cover_path = COALESCE(cover_path, ?), hidden = 0 WHERE id = ?'
    )
    const hide = this.db.prepare('UPDATE games SET hidden = 1 WHERE id = ?')
    const claimed = new Set<number>()
    let added = 0
    let updated = 0
    let removed = 0

    this.db.transaction(() => {
      for (const g of scanned) {
        const row = byFolder.get(g.folder)
        if (row) {
          update.run(g.exePath, g.installerPath, row.igdb_id ? null : g.coverPath, row.id)
          updated++
          continue
        }
        const idx = pending.findIndex((p) => titlesMatch(p.title, g.title))
        const mv = idx >= 0 ? -1 : moved.findIndex((m) => !claimed.has(m.id) && titlesMatch(m.title, g.title))
        if (idx >= 0) {
          install.run(g.folder, g.exePath, g.installerPath, g.coverPath, pending[idx].id)
          pending.splice(idx, 1)
          updated++
        } else if (mv >= 0) {
          relocate.run(g.folder, g.exePath, g.installerPath, g.coverPath, moved[mv].id)
          claimed.add(moved[mv].id)
          updated++
        } else {
          insert.run(g.folder, g.title, g.exePath, g.installerPath, g.coverPath, Date.now())
          added++
        }
      }
      for (const [folder, row] of byFolder) {
        if (!scannedFolders.has(folder) && !row.hidden && !claimed.has(row.id)) {
          hide.run(row.id)
          removed++
        }
      }
      this.repairSplitGames(scannedFolders)
    })()

    return { added, updated, removed, total: scanned.length }
  }

  /**
   * Older versions turned a moved folder into a second, unlinked game while the original (catalog link,
   * playtime) stayed hidden. Fold each such duplicate back into the original.
   */
  private repairSplitGames(scannedFolders: Set<string>): void {
    const rows = this.db.prepare("SELECT * FROM games WHERE source = 'folder'").all() as GameRow[]
    const orphans = rows.filter((r) => r.hidden && r.igdb_id && r.folder && !scannedFolders.has(r.folder))
    for (const old of orphans) {
      const dup = rows.find(
        (r) => !r.hidden && !r.igdb_id && r.folder && scannedFolders.has(r.folder) && titlesMatch(r.title, old.title)
      )
      if (dup) {
        this.absorb(old.id, dup.id)
        rows.splice(rows.indexOf(dup), 1)
      }
    }
  }

  /**
   * Merges `fromId` into `keepId`: keep takes from's folder/exe and playtime/sessions; from is deleted.
   * Used to reunite a game's catalog record with the folder it now lives in.
   */
  absorb(keepId: number, fromId: number): void {
    const from = this.db.prepare('SELECT * FROM games WHERE id = ?').get(fromId) as GameRow | undefined
    const keep = this.db.prepare('SELECT * FROM games WHERE id = ?').get(keepId) as GameRow | undefined
    if (!from || !keep || from.id === keep.id) return
    this.db.transaction(() => {
      this.db.prepare('UPDATE sessions SET game_id = ? WHERE game_id = ?').run(keepId, fromId)
      this.db.prepare('DELETE FROM input_profiles WHERE game_id = ?').run(fromId)
      // Delete first: frees the UNIQUE folder for keep.
      this.db.prepare('DELETE FROM games WHERE id = ?').run(fromId)
      this.db
        .prepare(
          `UPDATE games SET folder = ?, exe_path = ?, exe_override = ?, installer_path = ?, cover_path = COALESCE(cover_path, ?),
             total_seconds = total_seconds + ?, last_played_at = NULLIF(MAX(COALESCE(last_played_at, 0), COALESCE(?, 0)), 0),
             hidden = 0
           WHERE id = ?`
        )
        .run(from.folder, from.exe_path, from.exe_override, from.installer_path, from.cover_path, from.total_seconds, from.last_played_at, keepId)
    })()
  }


  /**
   * Installed games of one store: known ones by external id, then a folder already in the library or a
   * catalog (wishlist) entry with the same title, else a new row. Gone ones are hidden, keeping playtime.
   * Returns ids of games that just got a row, for artwork.
   */
  syncPlatform(source: Exclude<GameSource, 'folder'>, games: PlatformGame[]): number[] {
    const rows = this.db.prepare('SELECT * FROM games').all() as GameRow[]
    const byExt = new Map(rows.filter((r) => r.source === source && r.external_id).map((r) => [r.external_id!, r]))
    const byFolder = new Map(rows.filter((r) => r.folder).map((r) => [r.folder!.toLowerCase(), r]))
    const pending = rows.filter((r) => !r.folder)
    const update = this.db.prepare(
      'UPDATE games SET folder = ?, exe_path = COALESCE(?, exe_path), launch_uri = ?, hidden = 0 WHERE id = ?'
    )
    const attach = this.db.prepare(
      `UPDATE games SET source = ?, external_id = ?, folder = ?, exe_path = COALESCE(?, exe_path), launch_uri = ?, hidden = 0
       WHERE id = ?`
    )
    const insert = this.db.prepare(
      `INSERT INTO games (folder, title, exe_path, source, external_id, launch_uri, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    const hide = this.db.prepare('UPDATE games SET hidden = 1 WHERE id = ?')
    const seen = new Set<string>()
    const added: number[] = []

    this.db.transaction(() => {
      for (const g of games) {
        seen.add(g.externalId)
        const known = byExt.get(g.externalId)
        if (known) {
          update.run(g.folder, g.exePath, g.launchUri, known.id)
          continue
        }
        const same = byFolder.get(g.folder.toLowerCase())
        const idx = same ? -1 : pending.findIndex((p) => titlesMatch(p.title, g.title))
        const target = same ?? (idx >= 0 ? pending.splice(idx, 1)[0] : null)
        if (target) attach.run(source, g.externalId, g.folder, g.exePath, g.launchUri, target.id)
        else {
          const res = insert.run(g.folder, g.title, g.exePath, source, g.externalId, g.launchUri, Date.now())
          added.push(Number(res.lastInsertRowid))
        }
      }
      for (const [id, row] of byExt) if (!seen.has(id) && !row.hidden) hide.run(row.id)
    })()
    return added
  }

  setArt(gameId: number, coverPath: string | null, artPath: string | null): void {
    this.db
      .prepare('UPDATE games SET cover_path = COALESCE(cover_path, ?), art_path = COALESCE(art_path, ?) WHERE id = ?')
      .run(coverPath, artPath, gameId)
  }

  addCatalog(meta: CatalogMeta): Game {
    const res = this.db
      .prepare(
        `INSERT INTO games (title, igdb_id, summary, release_year, release_date, genres, cover_path, art_path, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        meta.title,
        meta.igdbId,
        meta.summary,
        meta.releaseYear,
        meta.releaseDate,
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
        `UPDATE games SET igdb_id = ?, summary = ?, release_year = ?, release_date = ?, genres = ?,
           cover_path = COALESCE(?, cover_path), art_path = COALESCE(?, art_path), title = ?
         WHERE id = ?`
      )
      .run(
        meta.igdbId,
        meta.summary,
        meta.releaseYear,
        meta.releaseDate,
        JSON.stringify(meta.genres),
        meta.coverPath,
        meta.artPath,
        meta.title,
        gameId
      )
    return this.get(gameId)!
  }

  /**
   * After the folder is gone: catalog games stay in the library as not installed; folder-only games
   * are hidden (like a rescan would), keeping their playtime if the folder comes back.
   */
  uninstall(gameId: number): void {
    this.db
      .prepare(
        `UPDATE games SET
           folder = CASE WHEN igdb_id IS NULL THEN folder ELSE NULL END,
           exe_path = CASE WHEN igdb_id IS NULL THEN exe_path ELSE NULL END,
           exe_override = CASE WHEN igdb_id IS NULL THEN exe_override ELSE NULL END,
           installer_path = CASE WHEN igdb_id IS NULL THEN installer_path ELSE NULL END,
           hidden = CASE WHEN igdb_id IS NULL THEN 1 ELSE hidden END
         WHERE id = ?`
      )
      .run(gameId)
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
