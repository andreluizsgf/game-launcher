export function formatPlaytime(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? 'menos de 1 min' : 'nunca jogado'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function formatDate(ts: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function mediaUrl(path: string | null): string | null {
  return path ? `media://local/${encodeURIComponent(path)}` : null
}

/** Stable hue from a string, for placeholder art. */
export function hueOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

export function formatReleaseDate(ts: number | null): string {
  if (!ts) return 'Data a definir'
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Color band for a 0–100 rating, Metacritic-style. */
export function ratingTone(r: number): 'good' | 'mixed' | 'bad' {
  return r >= 75 ? 'good' : r >= 50 ? 'mixed' : 'bad'
}
