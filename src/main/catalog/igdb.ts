const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API = 'https://api.igdb.com/v4'
const PC_WINDOWS = 6

export interface IgdbCredentials {
  clientId: string
  clientSecret: string
}

export interface IgdbImage {
  image_id: string
  width?: number
  height?: number
}

export interface IgdbGame {
  id: number
  name: string
  first_release_date?: number
  summary?: string
  genres?: { name: string }[]
  cover?: { image_id: string }
  artworks?: IgdbImage[]
  screenshots?: IgdbImage[]
  total_rating?: number
  total_rating_count?: number
  hypes?: number
}

export interface PopularityPrimitive {
  game_id: number
  value: number
}

export class MissingCredentialsError extends Error {
  constructor() {
    super('Configure o Client ID e o Secret do IGDB nas Configurações')
  }
}

export const imageUrl = (imageId: string, size: 'cover_big' | 'cover_big_2x' | 'cover_small' | '1080p' | 'screenshot_big') =>
  `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`

export const FIELDS =
  'fields name,first_release_date,summary,genres.name,cover.image_id,artworks.image_id,artworks.width,artworks.height,screenshots.image_id,screenshots.width,screenshots.height,total_rating,total_rating_count,hypes;'
export { PC_WINDOWS }

/** Apicalypse body for a game search on one platform (PC by default). Exported for tests. */
export function searchQuery(text: string, limit = 24, platform = PC_WINDOWS): string {
  const q = text.replace(/["\\]/g, ' ').trim()
  return `search "${q}"; ${FIELDS} where platforms = (${platform}) & version_parent = null; limit ${limit};`
}

export class IgdbClient {
  private token: { value: string; expiresAt: number } | null = null
  private tokenFor = ''

  constructor(private getCredentials: () => IgdbCredentials | null) {}

  private async auth(): Promise<{ headers: Record<string, string> }> {
    const creds = this.getCredentials()
    if (!creds) throw new MissingCredentialsError()
    const key = `${creds.clientId}:${creds.clientSecret}`
    if (!this.token || this.tokenFor !== key || Date.now() > this.token.expiresAt) {
      const url = `${TOKEN_URL}?${new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        grant_type: 'client_credentials'
      })}`
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) throw new Error(`Falha ao autenticar no Twitch/IGDB (${res.status}). Confira Client ID e Secret.`)
      const body = (await res.json()) as { access_token: string; expires_in: number }
      this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 300) * 1000 }
      this.tokenFor = key
    }
    return {
      headers: {
        'Client-ID': creds.clientId,
        Authorization: `Bearer ${this.token.value}`,
        Accept: 'application/json',
        'Content-Type': 'text/plain'
      }
    }
  }

  async query<T>(endpoint: string, body: string): Promise<T> {
    const { headers } = await this.auth()
    const res = await fetch(`${API}/${endpoint}`, { method: 'POST', headers, body })
    if (res.status === 401) {
      this.token = null
      throw new Error('Token IGDB expirado, tente de novo')
    }
    if (!res.ok) throw new Error(`IGDB respondeu ${res.status}`)
    return (await res.json()) as T
  }

  search(text: string, platform?: number): Promise<IgdbGame[]> {
    return this.query<IgdbGame[]>('games', searchQuery(text, 24, platform))
  }

  async get(id: number): Promise<IgdbGame | null> {
    const rows = await this.query<IgdbGame[]>('games', `${FIELDS} where id = ${Math.trunc(id)};`)
    return rows[0] ?? null
  }
}
