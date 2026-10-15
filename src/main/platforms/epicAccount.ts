import { readFileSync, writeFileSync } from 'fs'
import { gameFromCatalog, type CatalogItem } from './epic'
import type { PlatformGame } from './steam'

/**
 * The Epic Games Launcher's own public OAuth client — the same one Legendary and Heroic use to sign in
 * and list a library. Not a secret of ours: it ships inside the launcher.
 */
const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a'
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf'

const OAUTH = 'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token'
const LIBRARY = 'https://library-service.live.use1a.on.epicgames.com/library/api/public/items'
const CATALOG = 'https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace'

/** Epic's sign-in page; after login it lands on REDIRECT_PAGE, which shows the authorization code as JSON. */
export const EPIC_LOGIN_URL = `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(
  `https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`
)}`
export const REDIRECT_PAGE = 'https://www.epicgames.com/id/api/redirect'

/** The library listing is refreshed at most this often; between refreshes the cached list is used. */
const LIBRARY_TTL_MS = 30 * 60 * 1000

interface TokenResponse {
  access_token: string
  expires_at: string
  refresh_token: string
  displayName?: string
}

export interface LibraryRecord {
  namespace?: string
  catalogItemId?: string
  appName?: string
}

interface Cache {
  /** catalogItemId → item (titles and art don't change; fetched once). */
  catalog: Record<string, CatalogItem>
  library: LibraryRecord[]
  libraryAt: number
}

/** Library records + catalog items → games; Unreal Engine assets and DLC are dropped. */
export function libraryToGames(records: LibraryRecord[], catalog: Record<string, CatalogItem>): PlatformGame[] {
  const games = new Map<string, PlatformGame>()
  for (const r of records) {
    if (!r.namespace || r.namespace === 'ue' || !r.catalogItemId || !r.appName) continue
    const item = catalog[r.catalogItemId]
    const g = item ? gameFromCatalog({ ...item, id: r.catalogItemId, namespace: r.namespace }, r.appName) : null
    if (g) games.set(g.externalId, g)
  }
  return [...games.values()]
}

interface Deps {
  /** Encrypted-at-rest refresh token; Epic rotates it on every use. */
  getRefreshToken(): string | null
  saveLogin(refreshToken: string | null, displayName?: string): void
  cacheFile: string
}

/** Signed-in Epic account: lists every game it owns, not only installed ones. */
export class EpicAccount {
  private access: { token: string; expiresAt: number } | null = null
  private cache: Cache

  constructor(private d: Deps) {
    try {
      this.cache = JSON.parse(readFileSync(d.cacheFile, 'utf8'))
    } catch {
      this.cache = { catalog: {}, library: [], libraryAt: 0 }
    }
  }

  signedIn(): boolean {
    return !!this.d.getRefreshToken()
  }

  private async token(body: Record<string, string>): Promise<TokenResponse> {
    const res = await fetch(OAUTH, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ ...body, token_type: 'eg1' }),
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`Epic recusou o login (${res.status})`)
    const t = (await res.json()) as TokenResponse
    this.access = { token: t.access_token, expiresAt: Date.parse(t.expires_at) }
    this.d.saveLogin(t.refresh_token, t.displayName)
    return t
  }

  /** Finishes the sign-in with the code from the redirect page. Returns the account's display name. */
  async login(authorizationCode: string): Promise<string> {
    const t = await this.token({ grant_type: 'authorization_code', code: authorizationCode })
    this.cache.libraryAt = 0
    return t.displayName ?? 'Conta Epic'
  }

  logout(): void {
    this.access = null
    this.cache = { catalog: this.cache.catalog, library: [], libraryAt: 0 }
    this.save()
    this.d.saveLogin(null)
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt - Date.now() > 60_000) return this.access.token
    const refresh = this.d.getRefreshToken()
    if (!refresh) throw new Error('Conta Epic não conectada')
    try {
      return (await this.token({ grant_type: 'refresh_token', refresh_token: refresh })).access_token
    } catch (err) {
      // Expired/revoked session: sign out so Settings shows "Entrar" again.
      if (err instanceof Error && /\(4\d\d\)/.test(err.message)) this.d.saveLogin(null)
      throw err
    }
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
      signal: AbortSignal.timeout(20000)
    })
    if (!res.ok) throw new Error(`Epic respondeu ${res.status}`)
    return (await res.json()) as T
  }

  private save(): void {
    try {
      writeFileSync(this.d.cacheFile, JSON.stringify(this.cache))
    } catch {
      // Cache only; next sync fetches again.
    }
  }

  /** Every game on the account. Throws when Epic can't be reached and nothing is cached yet. */
  async ownedGames(): Promise<PlatformGame[]> {
    if (Date.now() - this.cache.libraryAt > LIBRARY_TTL_MS) {
      try {
        await this.refreshLibrary()
      } catch (err) {
        if (!this.cache.libraryAt) throw err
        console.warn('[epic] library refresh failed, using cache', err)
      }
    }
    return libraryToGames(this.cache.library, this.cache.catalog)
  }

  private async refreshLibrary(): Promise<void> {
    const records: LibraryRecord[] = []
    let cursor: string | undefined
    do {
      const url = new URL(LIBRARY)
      url.searchParams.set('includeMetadata', 'true')
      if (cursor) url.searchParams.set('cursor', cursor)
      const page = await this.get<{ records?: LibraryRecord[]; responseMetadata?: { nextCursor?: string } }>(
        url.toString()
      )
      records.push(...(page.records ?? []))
      cursor = page.responseMetadata?.nextCursor
    } while (cursor)

    // Catalog details only for items not seen before, one request per namespace.
    const missing = new Map<string, string[]>()
    for (const r of records) {
      if (!r.namespace || r.namespace === 'ue' || !r.catalogItemId || this.cache.catalog[r.catalogItemId]) continue
      missing.set(r.namespace, [...(missing.get(r.namespace) ?? []), r.catalogItemId])
    }
    const jobs = [...missing].map(([ns, ids]) => async () => {
      const url = new URL(`${CATALOG}/${encodeURIComponent(ns)}/bulk/items`)
      for (const id of ids) url.searchParams.append('id', id)
      for (const [k, v] of Object.entries({
        includeDLCDetails: 'true',
        includeMainGameDetails: 'true',
        country: 'US',
        locale: 'en-US'
      }))
        url.searchParams.set(k, v)
      const items = await this.get<Record<string, CatalogItem>>(url.toString()).catch(() => ({}))
      Object.assign(this.cache.catalog, items)
    })
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(6, jobs.length) }, async () => {
        while (next < jobs.length) await jobs[next++]()
      })
    )
    this.cache.library = records
    this.cache.libraryAt = Date.now()
    this.save()
  }
}
