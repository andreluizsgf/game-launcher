/** Lowercase alphanumerics only: "The Witcher® 3" → "thewitcher3". */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Keys a title can be matched by: the full name and the name without its subtitle
 * ("The Witcher 3: Wild Hunt" → also "thewitcher3"). Deliberately no prefix matching,
 * so "Hades" never matches "Hades II".
 */
export function titleKeys(title: string): string[] {
  const keys = new Set<string>([normalizeTitle(title)])
  const main = title.split(/\s*[:–—]\s*|\s+-\s+/)[0]
  if (main && main !== title) keys.add(normalizeTitle(main))
  keys.delete('')
  return [...keys]
}

export function titlesMatch(a: string, b: string): boolean {
  const ka = titleKeys(a)
  return titleKeys(b).some((k) => ka.includes(k))
}
