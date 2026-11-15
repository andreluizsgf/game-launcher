import { readdirSync } from 'fs'
import { join } from 'path'
import { systemById, systemForFolder } from '@shared/systems'

/**
 * A system's folder inside the ROMs folder: the existing one under any accepted name (e.g. "PS2",
 * "PlayStation2"), else `<ROMs folder>/<first accepted name>`, which qBittorrent creates on download.
 */
export function systemRomsDir(romsRoot: string | null, systemId: string): string | null {
  const system = systemById(systemId)
  if (!romsRoot || !system) return null
  try {
    const found = readdirSync(romsRoot, { withFileTypes: true }).find(
      (e) => e.isDirectory() && systemForFolder(e.name)?.id === system.id
    )
    if (found) return join(romsRoot, found.name)
  } catch {
    // ROMs folder missing: fall back to the default name.
  }
  return join(romsRoot, system.folders[0])
}
