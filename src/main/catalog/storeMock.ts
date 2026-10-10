import type { StoreGame, StoreSection } from '@shared/types'

/** Dev-only fake store (`GL_STORE_MOCK=1`) to work on the UI without IGDB credentials. */
const svg = (w: number, h: number, hue: number, label: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="hsl(${hue},65%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,12%)"/>` +
      `</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>` +
      `<text x="50%" y="55%" font-family="sans-serif" font-size="${Math.round(w / 9)}" fill="white" fill-opacity=".85" text-anchor="middle">${label}</text></svg>`
  )

const NAMES = [
  'Neon Drift', 'Hollow Crown', 'Starfall Tactics', 'Ember Saga', 'Pixel Ronin', 'Tidebreaker',
  'Iron Bloom', 'Moonlit Garden', 'Rogue Signal', 'Ashen Peaks', 'Velvet Circuit', 'Last Lantern'
]

function game(i: number, section: number): StoreGame {
  const name = NAMES[(i + section * 3) % NAMES.length]
  const hue = (i * 47 + section * 90) % 360
  const releaseDate = Date.UTC(2026, (i + section) % 12, 1 + i)
  return {
    igdbId: section * 100 + i,
    name,
    year: 2026,
    releaseDate,
    coverUrl: svg(264, 352, hue, name.split(' ')[0]),
    artUrl: svg(1920, 1080, hue, ''),
    rating: 60 + ((i * 13 + section * 7) % 40),
    ratingCount: 100 + i * 37,
    genres: ['Ação', 'Aventura', 'RPG'].slice(0, 1 + (i % 3)),
    summary: 'Jogo fictício para desenvolver a interface da loja sem credenciais do IGDB. ' + 'Texto de exemplo. '.repeat(6),
    screenshots: [svg(569, 320, hue + 20, ''), svg(569, 320, hue + 40, '')],
    inLibraryId: null
  }
}

export function mockSections(): StoreSection[] {
  const titles = ['Em alta agora', 'Melhores do ano', 'Lançamentos recentes', 'Mais aguardados', 'Clássicos aclamados']
  const ids = ['trending', 'bestOfYear', 'newReleases', 'upcoming', 'classics']
  return titles.map((title, s) => ({ id: ids[s], title, games: Array.from({ length: 12 }, (_, i) => game(i, s)) }))
}
