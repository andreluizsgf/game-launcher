import type { StoreGame, StoreSection } from '@shared/types'
import { hasWideArt, pickWide } from './art'
import { FIELDS, imageUrl, PC_WINDOWS, type IgdbClient, type IgdbGame, type PopularityPrimitive } from './igdb'

const DAY = 86_400
const CACHE_MS = 30 * 60 * 1000
/** Banner size. */
const FEATURED_COUNT = 6
/** Genre/theme rows shown per refresh, drawn from GENRE_POOL. */
const GENRE_ROWS = 5
/** IGDB popularity type 1 = page visits on IGDB (the most broadly populated signal). */
const POPULARITY_VISITS = 1

/** IGDB tags every adult game with the "erotic" theme; its docs give this id for filtering them out. */
const EROTIC_THEME = 42

/** Main games only (no DLC/editions/ports), PC, with a cover, no adult games. */
const BASE =
  `platforms = (${PC_WINDOWS}) & version_parent = null & parent_game = null & cover != null` +
  ` & themes != (${EROTIC_THEME})`

/**
 * Ids resolved from IGDB by slug/name on each refresh, so sections never depend on guessed ids.
 * A missing entry just drops its section.
 */
export interface Lookups {
  genres: Map<string, number>
  themes: Map<string, number>
  popularity: { id: number; name: string }[]
}

interface SectionDef {
  id: string
  title: string
  load(igdb: IgdbClient, now: number, lk: Lookups): Promise<IgdbGame[]>
}

const list = (where: string, sort: string, limit = 20) =>
  `${FIELDS} where ${BASE} & ${where}; sort ${sort}; limit ${limit};`

/** Exported for tests: the Apicalypse body of each list-based section. */
export const sectionQueries = (now: number) => ({
  bestOfYear: list(`first_release_date >= ${now - 365 * DAY} & first_release_date <= ${now} & total_rating_count >= 15`, 'total_rating desc'),
  newReleases: list(`first_release_date >= ${now - 45 * DAY} & first_release_date <= ${now}`, 'hypes desc'),
  upcoming: list(`first_release_date > ${now} & hypes > 0`, 'hypes desc'),
  classics: list('total_rating_count >= 800', 'total_rating desc', 50),
  /** Well-rated games of a genre/theme from the last 6 years; 50 so each refresh can sample a different 20. */
  greatIn: (field: 'genres' | 'themes', id: number) =>
    list(
      `${field} = (${id}) & first_release_date >= ${now - 6 * 365 * DAY} & first_release_date <= ${now} & total_rating_count >= 25`,
      'total_rating desc',
      50
    )
})

/** Games ranked by an IGDB popularity primitive (IGDB visits, Steam sellers/players…). */
async function byPopularity(igdb: IgdbClient, type: number, extra = ''): Promise<IgdbGame[]> {
  const prims = await igdb.query<PopularityPrimitive[]>(
    'popularity_primitives',
    `fields game_id,value; where popularity_type = ${type}; sort value desc; limit 150;`
  )
  if (!prims.length) return []
  const rank = new Map(prims.map((p, i) => [p.game_id, i]))
  const games = await igdb.query<IgdbGame[]>(
    'games',
    `${FIELDS} where id = (${prims.map((p) => p.game_id).join(',')}) & ${BASE}${extra}; limit 150;`
  )
  return games.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!).slice(0, 20)
}

const popularitySection = (id: string, title: string, name: RegExp): SectionDef => ({
  id,
  title,
  load: (igdb, _now, lk) => {
    const type = lk.popularity.find((p) => name.test(p.name))
    return type ? byPopularity(igdb, type.id) : Promise.resolve([])
  }
})

const greatSection = (id: string, title: string, field: 'genres' | 'themes', slug: string): SectionDef => ({
  id,
  title,
  load: async (igdb, now, lk) => {
    const ref = lk[field].get(slug)
    if (!ref) return []
    return sampleInOrder(await igdb.query<IgdbGame[]>('games', sectionQueries(now).greatIn(field, ref)), 20)
  }
})

/** Fisher–Yates on a copy. `rand` is injectable for tests. */
export function shuffle<T>(items: T[], rand = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** `n` random items keeping their original (ranked) order, so a row changes but still reads best-first. */
export function sampleInOrder<T>(items: T[], n: number, rand = Math.random): T[] {
  if (items.length <= n) return items
  const keep = new Set(shuffle(items.map((_, i) => i), rand).slice(0, n))
  return items.filter((_, i) => keep.has(i))
}

/** Sections whose games can headline the banner (the rest are too old or too niche to feature). */
const FEATURE_SOURCES = ['newReleases', 'bestOfYear', 'upcoming', 'trending', 'topSellers', 'mostPlayed']

/**
 * The banner: recent or upcoming games with real landscape art, shuffled, so it changes on every refresh
 * instead of always being the top of "Em alta" (IGDB visits are dominated by evergreen games like Roblox).
 * Rated games need a decent score; unrated ones (new/upcoming) pass on hype.
 */
export function pickFeatured(
  sections: { id: string; games: IgdbGame[] }[],
  now: number,
  rand = Math.random,
  count = FEATURED_COUNT
): IgdbGame[] {
  const seen = new Set<number>()
  const pool: IgdbGame[] = []
  for (const s of sections.filter((s) => FEATURE_SOURCES.includes(s.id))) {
    for (const g of s.games) {
      if (seen.has(g.id) || !hasWideArt(g) || !g.first_release_date) continue
      const fresh = g.first_release_date >= now - 2 * 365 * DAY
      const rated = (g.total_rating_count ?? 0) >= 5 && g.total_rating != null
      const good = rated ? g.total_rating! >= 75 : (g.hypes ?? 0) >= 5
      if (!fresh || !good) continue
      seen.add(g.id)
      pool.push(g)
    }
  }
  return shuffle(pool, rand).slice(0, count)
}

async function loadLookups(igdb: IgdbClient): Promise<Lookups> {
  const [genres, themes, popularity] = await Promise.all([
    igdb.query<{ id: number; slug: string }[]>('genres', 'fields id,slug; limit 100;').catch(() => []),
    igdb.query<{ id: number; slug: string }[]>('themes', 'fields id,slug; limit 100;').catch(() => []),
    igdb.query<{ id: number; name: string }[]>('popularity_types', 'fields id,name; limit 100;').catch(() => [])
  ])
  return {
    genres: new Map(genres.map((g) => [g.slug, g.id])),
    themes: new Map(themes.map((t) => [t.slug, t.id])),
    popularity
  }
}

/** Fixed rows, always shown in this order. */
const SECTIONS: SectionDef[] = [
  // IGDB visits rank Roblox/Minecraft forever; only games from the last 3 years make it "em alta".
  {
    id: 'trending',
    title: 'Em alta agora',
    load: (igdb, now) => byPopularity(igdb, POPULARITY_VISITS, ` & first_release_date >= ${now - 3 * 365 * DAY}`)
  },
  popularitySection('topSellers', 'Mais vendidos no Steam', /top\s*sellers/i),
  popularitySection('mostPlayed', 'Mais jogados agora', /peak\s*players/i),
  { id: 'bestOfYear', title: 'Melhores do ano', load: (igdb, now) => igdb.query('games', sectionQueries(now).bestOfYear) },
  { id: 'newReleases', title: 'Lançamentos recentes', load: (igdb, now) => igdb.query('games', sectionQueries(now).newReleases) },
  { id: 'upcoming', title: 'Mais aguardados', load: (igdb, now) => igdb.query('games', sectionQueries(now).upcoming) },
  {
    id: 'classics',
    title: 'Clássicos aclamados',
    load: async (igdb, now) => sampleInOrder(await igdb.query<IgdbGame[]>('games', sectionQueries(now).classics), 20)
  }
]

/** Genre/theme rows: GENRE_ROWS of them are drawn at random on each refresh and shown before "Clássicos". */
const GENRE_POOL: SectionDef[] = [
  greatSection('rpg', 'Ótimos RPGs', 'genres', 'role-playing-rpg'),
  greatSection('shooter', 'Tiro de primeira', 'genres', 'shooter'),
  greatSection('indie', 'Indies imperdíveis', 'genres', 'indie'),
  greatSection('strategy', 'Estratégia', 'genres', 'strategy'),
  greatSection('adventure', 'Grandes aventuras', 'genres', 'adventure'),
  greatSection('platform', 'Plataforma', 'genres', 'platform'),
  greatSection('racing', 'Velocidade', 'genres', 'racing'),
  greatSection('fighting', 'Luta', 'genres', 'fighting'),
  greatSection('puzzle', 'Quebra-cabeças', 'genres', 'puzzle'),
  greatSection('sport', 'Esportes', 'genres', 'sport'),
  greatSection('simulator', 'Simulação', 'genres', 'simulator'),
  greatSection('horror', 'Para sentir medo', 'themes', 'horror'),
  greatSection('openWorld', 'Mundos abertos', 'themes', 'open-world'),
  greatSection('survival', 'Sobrevivência', 'themes', 'survival'),
  greatSection('scifi', 'Ficção científica', 'themes', 'science-fiction'),
  greatSection('fantasy', 'Fantasia', 'themes', 'fantasy')
]

export function toStoreGame(g: IgdbGame, inLibraryId: number | null): StoreGame {
  // Only real landscape art: a portrait fallback cropped to the backdrop looks broken.
  const wide = hasWideArt(g) ? pickWide(g) : null
  return {
    igdbId: g.id,
    name: g.name,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    releaseDate: g.first_release_date ? g.first_release_date * 1000 : null,
    coverUrl: g.cover ? imageUrl(g.cover.image_id, 'cover_big_2x') : null,
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
      const lookups = await loadLookups(this.igdb)
      const defs = [...SECTIONS.slice(0, -1), ...shuffle(GENRE_POOL).slice(0, GENRE_ROWS), ...SECTIONS.slice(-1)]
      // Two at a time (with a pause) keeps us under IGDB's 4 req/s limit.
      const loaded: { id: string; title: string; games: IgdbGame[] }[] = []
      let firstError: unknown = null
      for (let i = 0; i < defs.length; i += 2) {
        const batch = defs.slice(i, i + 2)
        if (i > 0) await new Promise((r) => setTimeout(r, 300))
        const res = await Promise.allSettled(batch.map((s) => s.load(this.igdb, now, lookups)))
        res.forEach((r, j) => {
          if (r.status === 'fulfilled') loaded.push({ id: batch[j].id, title: batch[j].title, games: r.value })
          else firstError ??= r.reason
        })
      }
      // One broken section is tolerable; all of them failing means auth/network — surface it.
      if (loaded.length === 0 && firstError) throw firstError
      const featured = { id: 'featured', title: 'Em destaque', games: pickFeatured(loaded, now) }
      this.cache = { at: Date.now(), sections: [featured, ...loaded] }
    }
    return this.cache.sections
      .filter((s) => s.games.length > 0)
      .map((s) => ({ id: s.id, title: s.title, games: s.games.map((g) => toStoreGame(g, this.libraryId(g.id))) }))
  }
}
