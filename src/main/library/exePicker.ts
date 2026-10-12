export interface ExeCandidate {
  /** Path relative to the game folder, using "/" separators. */
  relPath: string
  size: number
}

const BLOCKLIST = [
  /^unins/i,
  /setup/i,
  /redist/i,
  /^vc_?redist/i,
  /^dxsetup/i,
  /^dxwebsetup/i,
  /crashhandler/i,
  /crashreport/i,
  /^ue4prereq/i,
  /^dotnet/i,
  /^oalinst/i,
  /^physx/i,
  /^notification_helper/i,
  /^installer/i,
  /^config(urator)?\.exe$/i,
  /^quicksfv/i
]

const BLOCKED_DIRS =
  /(^|\/)(_commonredist|redist|redistributables|directx|support|installers?|__installer|prereq\w*|md5|engine\/binaries\/thirdparty)(\/|$)/i

const SOFT_PENALTY = /launcher|settings|config|editor|server|helper|benchmark/i

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.exe$/, '')
    .replace(/[^a-z0-9]/g, '')
}

function baseName(relPath: string): string {
  const parts = relPath.split('/')
  return parts[parts.length - 1]
}

/** Similarity 0..1 between exe name and folder name. */
function nameScore(exe: string, folder: string): number {
  const a = normalizeName(exe)
  const b = normalizeName(folder)
  if (!a || !b) return 0
  if (a === b) return 1
  if (b.includes(a) || a.includes(b)) return 0.8
  // shared prefix ratio
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i >= 3 ? 0.5 * (i / Math.min(a.length, b.length)) : 0
}

export function isBlocked(c: ExeCandidate): boolean {
  const name = baseName(c.relPath)
  if (BLOCKLIST.some((r) => r.test(name))) return true
  const dir = c.relPath.includes('/') ? c.relPath.slice(0, c.relPath.lastIndexOf('/')) : ''
  return BLOCKED_DIRS.test(dir)
}

/**
 * Picks the most likely main executable of a game folder.
 * Order: drop blocked → prefer name match → avoid launcher-ish names → shallower → bigger.
 */
export function pickExe(candidates: ExeCandidate[], folderName: string): ExeCandidate | null {
  const allowed = candidates.filter((c) => !isBlocked(c))
  if (allowed.length === 0) return null
  const maxSize = Math.max(...allowed.map((c) => c.size), 1)

  const scored = allowed.map((c) => {
    const name = baseName(c.relPath)
    const depth = c.relPath.split('/').length - 1
    let score = nameScore(name, folderName) * 3
    if (SOFT_PENALTY.test(name) && allowed.length > 1) score -= 1.5
    if (/-shipping\.exe$/i.test(name) || /win64/i.test(c.relPath)) score += 0.5
    score -= depth * 0.2
    score += (c.size / maxSize) * 1.5
    return { c, score }
  })
  scored.sort((x, y) => y.score - x.score)
  return scored[0].c
}

const INSTALLER = /^(setup|install)\.exe$/i

/**
 * Repack installer (FitGirl, DODI, ElAmigos… ship a setup.exe next to the data files): at the top of the
 * folder or one level down, where downloads put the release folder.
 */
export function pickInstaller(candidates: ExeCandidate[]): ExeCandidate | null {
  return (
    candidates
      .filter((c) => c.relPath.split('/').length <= 2 && INSTALLER.test(baseName(c.relPath)))
      .sort((a, b) => a.relPath.split('/').length - b.relPath.split('/').length)[0] ?? null
  )
}

/** "The_Witcher.3-v4.04" → "The Witcher 3" */
export function titleFromFolder(folder: string): string {
  return (
    folder
      .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
      .replace(/[\s._-]+v?\d+(\.\d+){1,}.*$/i, '')
      .replace(/[._]+/g, ' ')
      .replace(/\s+-\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim() || folder
  )
}
