import type { PadStatus } from './gamepad'

/** At or below this (and not charging) a battery shows red and a toast warns once. */
export const LOW_BATTERY = 20

/**
 * Toasts for a pad status change: pads coming and going, and a low battery once per discharge (re-armed when
 * it charges or climbs back above the threshold). `warned` holds the pads (by position) already warned.
 */
export function padNotices(prev: PadStatus, next: PadStatus, warned: Set<number>): string[] {
  const out: string[] = []
  const before = prev.pads.length
  const now = next.pads.length
  if (now > before) out.push(now > 1 ? `Controle ${now} conectado` : 'Controle conectado')
  else if (now < before) out.push(now > 0 ? `Um controle desconectou (${now} conectado)` : 'Controle desconectado')
  next.pads.forEach((p, i) => {
    const b = p.battery
    if (!b) return
    if (b.charging || b.level > LOW_BATTERY) return void warned.delete(i)
    if (warned.has(i)) return
    warned.add(i)
    out.push(`Bateria do controle${now > 1 ? ` ${i + 1}` : ''} fraca (${b.level}%)`)
  })
  for (const i of [...warned]) if (i >= now) warned.delete(i)
  return out
}
