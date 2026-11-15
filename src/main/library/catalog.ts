import { systemById } from '@shared/systems'
import type { CatalogHit, Game, GameMedia } from '@shared/types'
import { cacheArt } from '../catalog/art'
import { IgdbClient, imageUrl, type IgdbGame } from '../catalog/igdb'
import { mediaQuery, toMedia, type IgdbMediaGame } from '../catalog/media'
import type { CatalogMeta, GamesRepo } from '../db/games'

/** IGDB-backed metadata: search, add to the library, link a library game to its catalog entry. */
export class Catalog {
  constructor(
    readonly igdb: IgdbClient,
    private repo: GamesRepo,
    private artDir: string
  ) {}

  async toMeta(g: IgdbGame): Promise<CatalogMeta> {
    return {
      igdbId: g.id,
      title: g.name,
      summary: g.summary ?? null,
      releaseYear: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
      releaseDate: g.first_release_date ? g.first_release_date * 1000 : null,
      genres: (g.genres ?? []).map((x) => x.name),
      ...(await cacheArt(this.artDir, g))
    }
  }

  async fetchMeta(igdbId: number): Promise<CatalogMeta> {
    const g = await this.igdb.get(igdbId)
    if (!g) throw new Error('Jogo não encontrado no IGDB')
    return this.toMeta(g)
  }

  /** `system`: an emulated game's system id, to search that console instead of PC. */
  async search(query: string, system?: string | null): Promise<CatalogHit[]> {
    const games = await this.igdb.search(query, systemById(system)?.igdbPlatform)
    return games.map((g) => ({
      igdbId: g.id,
      name: g.name,
      year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
      coverUrl: g.cover ? imageUrl(g.cover.image_id, 'cover_big') : null,
      inLibraryId: this.repo.byIgdbId(g.id)?.id ?? null
    }))
  }

  /** Gallery of a catalog game: trailers, screenshots, artworks. */
  async media(igdbId: number): Promise<GameMedia[]> {
    const [g] = await this.igdb.query<IgdbMediaGame[]>('games', mediaQuery(igdbId))
    return g ? toMedia(g) : []
  }

  /**
   * Adds a catalog game; merges into an installed game with the same title when there is one.
   * `platform`: an emulated system id, so the wishlist entry is that console's (and only its ROMs merge).
   */
  async add(igdbId: number, platform?: string | null): Promise<Game> {
    const existing = this.repo.byIgdbId(igdbId)
    if (existing) return existing
    const system = systemById(platform)?.id ?? null
    const meta = await this.fetchMeta(igdbId)
    const installed = this.repo.findUnlinkedInstalled(meta.title, system)
    return installed ? this.repo.applyCatalog(installed.id, meta) : this.repo.addCatalog(meta, system)
  }

  /** Attaches catalog metadata/art to a library game. */
  async link(gameId: number, igdbId: number): Promise<Game> {
    const other = this.repo.byIgdbId(igdbId)
    if (other && other.id !== gameId) {
      // Linking an installed game to a catalog entry that is only on the wishlist: absorb it.
      if (!other.folder) this.repo.removeCatalog(other.id)
      // Hidden = its folder is gone: this game is the same one in a new place. Reunite them.
      else if (other.hidden) {
        this.repo.absorb(other.id, gameId)
        return this.repo.applyCatalog(other.id, await this.fetchMeta(igdbId))
      } else throw new Error(`"${other.title}" já está ligado a esse jogo`)
    }
    return this.repo.applyCatalog(gameId, await this.fetchMeta(igdbId))
  }
}
