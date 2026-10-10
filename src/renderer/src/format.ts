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

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${units[i]}`
}

export function formatEta(seconds: number | null): string {
  if (seconds == null) return ''
  if (seconds < 60) return 'menos de 1 min'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** "Baixando 42% · 12 MB/s · 1 h 5 min" style status for a torrent. */
export function formatDownload(d: { progress: number; state: string; speed: number; eta: number | null }): string {
  const pct = `${Math.floor(d.progress * 100)}%`
  if (d.state === 'paused') return `Pausado · ${pct}`
  if (d.state === 'queued') return `Na fila · ${pct}`
  if (d.state === 'error') return `Erro no download · ${pct}`
  if (d.state === 'stalled') return `Sem conexão com peers · ${pct}`
  return [`Baixando ${pct}`, d.speed > 0 ? `${formatBytes(d.speed)}/s` : '', d.eta ? `${formatEta(d.eta)} restantes` : '']
    .filter(Boolean)
    .join(' · ')
}
