import type { StoreGame, StoreSection } from '@shared/types'
import { FIELDS, imageUrl, PC_WINDOWS, type IgdbClient, type IgdbGame, type PopularityPrimitive } from './igdb'

const DAY = 86_400
const CACHE_MS = 30 * 60 * 1000
/** IGDB popularity type 1 = page visits on IGDB (the most broadly populated signal). */
const POPULARITY_VISITS = 1

/** Main games only (no DLC/editions/ports), PC, with a cover. */
const BASE = `platforms = (${PC_WINDOWS}) & version_parent = null & parent_game = null & cover != null`

interface SectionDef {
  id: string
  title: string
  load(igdb: IgdbClient, now: number): Promise<IgdbGame[]>
}

const list = (where: string, sort: string, limit = 20) =>
  `${FIELDS} where ${BASE} & ${where}; sort ${sort}; limit ${limit};`

/** Exported for tests: the Apicalypse body of each list-based section. */
export const sectionQueries = (now: number) => ({
  bestOfYear: list(`first_release_date >= ${now - 365 * DAY} & first_release_date <= ${now} & total_rating_count >= 15`, 'total_rating desc'),
  newReleases: list(`first_release_date >= ${now - 45 * DAY} & first_release_date <= ${now}`, 'hypes desc'),
  upcoming: list(`first_release_date > ${now} & hypes > 0`, 'hypes desc'),
  classics: list('total_rating_count >= 800', 'total_rating desc')
})

const SECTIONS: SectionDef[] = [
  {
    id: 'trending',
    title: 'Em alta agora',
    async load(igdb) {
      const prims = await igdb.query<PopularityPrimitive[]>(
        'popularity_primitives',
        `fields game_id,value; where popularity_type = ${POPULARITY_VISITS}; sort value desc; limit 60;`
      )
      if (!prims.length) return []
      const rank = new Map(prims.map((p, i) => [p.game_id, i]))
      const games = await igdb.query<IgdbGame[]>(
        'games',
        `${FIELDS} where id = (${prims.map((p) => p.game_id).join(',')}) & ${BASE}; limit 60;`
      )
      return games.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!).slice(0, 20)
    }
  },
  { id: 'bestOfYear', title: 'Melhores do ano', load: (igdb, now) => igdb.query('games', sectionQueries(now).bestOfYear) },
  { id: 'newReleases', title: 'Lançamentos recentes', load: (igdb, now) => igdb.query('games', sectionQueries(now).newReleases) },
  { id: 'upcoming', title: 'Mais aguardados', load: (igdb, now) => igdb.query('games', sectionQueries(now).upcoming) },
  { id: 'classics', title: 'Clássicos aclamados', load: (igdb, now) => igdb.query('games', sectionQueries(now).classics) }
]

export function toStoreGame(g: IgdbGame, inLibraryId: number | null): StoreGame {
  const wide = g.artworks?.[0]?.image_id ?? g.screenshots?.[0]?.image_id
  return {
    igdbId: g.id,
    name: g.name,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    releaseDate: g.first_release_date ? g.first_release_date * 1000 : null,
    coverUrl: g.cover ? imageUrl(g.cover.image_id, 'cover_big') : null,
    artUrl: wide ? imageUrl(wide, '1080p') : null,
    rating: g.total_rating != null ? Math.round(g.total_rating) : null,
    ratingCount: g.total_rating_count ?? 0,
    genres: (g.genres ?? []).map((x) => x.name),
    summary: g.summary ?? null,
    screenshots: (g.screenshots ?? []).slice(0, 6).map((s) => imageUrl(s.image_id, 'screenshot_big')),
    inLibraryId
  }
}

export class StoreService {
  private cache: { at: number; sections: { id: string; title: string; games: IgdbGame[] }[] } | null = null

  constructor(
    private igdb: IgdbClient,
    private libraryId: (igdbId: number) => number | null
  ) {}

  /** Sections are cached for 30 min; library membership is re-resolved on every call. */
  async sections(force = false): Promise<StoreSection[]> {
    if (force || !this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const now = Math.floor(Date.now() / 1000)
      // Two at a time keeps us well under IGDB's 4 req/s limit.
      const loaded: { id: string; title: string; games: IgdbGame[] }[] = []
      let firstError: unknown = null
      for (let i = 0; i < SECTIONS.length; i += 2) {
        const batch = SECTIONS.slice(i, i + 2)
        const res = await Promise.allSettled(batch.map((s) => s.load(this.igdb, now)))
        res.forEach((r, j) => {
          if (r.status === 'fulfilled') loaded.push({ id: batch[j].id, title: batch[j].title, games: r.value })
          else firstError ??= r.reason
        })
      }
      // One broken section is tolerable; all of them failing means auth/network — surface it.
      if (loaded.length === 0 && firstError) throw firstError
      this.cache = { at: Date.now(), sections: loaded }
    }
    return this.cache.sections
      .filter((s) => s.games.length > 0)
      .map((s) => ({ id: s.id, title: s.title, games: s.games.map((g) => toStoreGame(g, this.libraryId(g.id))) }))
  }
}
