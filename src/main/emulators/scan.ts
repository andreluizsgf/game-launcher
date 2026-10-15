import { existsSync, promises as fs } from 'fs'
import { basename, dirname, extname, join, relative } from 'path'
import { systemForFolder, type GameSystem } from '@shared/systems'
import { titleFromFolder } from '../library/exePicker'
import type { PlatformGame } from '../platforms/steam'
import { parseSfo } from './sfo'

/** One ROM (file) or PS3 game (EBOOT.BIN) found under the ROMs folder. */
export interface RomGame extends PlatformGame {
  platform: string
}

async function list(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

const ext = (name: string) => extname(name).slice(1).toLowerCase()
const DISC = /\s*[([]\s*(disc|disk|cd)\s*\d+[^)\]]*[)\]]/i

/** "Final Fantasy VII (USA) (Disc 1).chd" → "Final Fantasy VII" */
export const romTitle = (file: string) =>
  titleFromFolder(basename(file, extname(file)).replace(DISC, ' ')).replace(/[™®]/g, '').trim()

/**
 * The ROMs of one system folder (and one level of subfolders). Track files that belong to a playlist or
 * cue sheet are left out, and multi-disc sets show once (first disc).
 */
export async function scanSystemFolder(dir: string, system: GameSystem): Promise<string[]> {
  const files: string[] = []
  for (const e of await list(dir)) {
    if (e.isFile()) files.push(join(dir, e.name))
    else if (e.isDirectory()) for (const f of await list(join(dir, e.name))) if (f.isFile()) files.push(join(dir, e.name, f.name))
  }
  const roms = files.filter((f) => system.exts.includes(ext(f))).sort()
  const hasSheet = new Set(roms.filter((f) => ['cue', 'm3u', 'gdi'].includes(ext(f))).map((f) => dirname(f)))
  // Files a .m3u playlist points at.
  const inPlaylist = new Set<string>()
  for (const m3u of roms.filter((f) => ext(f) === 'm3u')) {
    try {
      for (const line of (await fs.readFile(m3u, 'utf8')).split(/\r?\n/)) {
        if (line.trim() && !line.startsWith('#')) inPlaylist.add(join(dirname(m3u), line.trim()).toLowerCase())
      }
    } catch {
      // unreadable playlist: its discs just show up individually
    }
  }
  const seen = new Set<string>()
  return roms.filter((f) => {
    if (inPlaylist.has(f.toLowerCase())) return false
    // .bin tracks of a .cue sheet (Mega Drive .bin ROMs have no sheet).
    if (ext(f) === 'bin' && hasSheet.has(dirname(f))) return false
    const key = `${dirname(f)}|${romTitle(f).toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const sfoTitle = async (sfoPath: string) => {
  try {
    const sfo = parseSfo(await fs.readFile(sfoPath))
    return { title: typeof sfo.TITLE === 'string' ? sfo.TITLE : null, category: String(sfo.CATEGORY ?? '') }
  } catch {
    return null
  }
}

/** PS3: game folders (disc dumps with PS3_GAME/, or extracted PSN games with USRDIR/) and .iso files. */
export async function scanPs3Folder(dir: string): Promise<Array<{ path: string; title: string }>> {
  const out: Array<{ path: string; title: string }> = []
  for (const e of await list(dir)) {
    const full = join(dir, e.name)
    if (e.isFile() && ext(e.name) === 'iso') out.push({ path: full, title: romTitle(e.name) })
    if (!e.isDirectory()) continue
    for (const base of [join(full, 'PS3_GAME'), full]) {
      const eboot = join(base, 'USRDIR', 'EBOOT.BIN')
      if (!existsSync(eboot)) continue
      const sfo = await sfoTitle(join(base, 'PARAM.SFO'))
      out.push({ path: eboot, title: cleanTitle(sfo?.title) ?? romTitle(e.name) })
      break
    }
  }
  return out
}

/** Games installed inside RPCS3 (PSN packages and copied discs); patches and save data are skipped. */
export async function scanRpcs3Hdd(rpcs3Dir: string): Promise<Array<{ path: string; title: string }>> {
  const out: Array<{ path: string; title: string }> = []
  const hdd = join(rpcs3Dir, 'dev_hdd0')
  for (const e of await list(join(hdd, 'game'))) {
    const base = join(hdd, 'game', e.name)
    const sfo = await sfoTitle(join(base, 'PARAM.SFO'))
    const eboot = join(base, 'USRDIR', 'EBOOT.BIN')
    if (sfo?.category === 'HG' && existsSync(eboot)) out.push({ path: eboot, title: cleanTitle(sfo.title) ?? e.name })
  }
  for (const e of await list(join(hdd, 'disc'))) {
    const base = join(hdd, 'disc', e.name, 'PS3_GAME')
    const eboot = join(base, 'USRDIR', 'EBOOT.BIN')
    if (!existsSync(eboot)) continue
    const sfo = await sfoTitle(join(base, 'PARAM.SFO'))
    out.push({ path: eboot, title: cleanTitle(sfo?.title) ?? e.name })
  }
  return out
}

const cleanTitle = (t: string | null | undefined) =>
  t
    ? t
        .replace(/[™®]/g, '')
        .replace(/\s*\n\s*/g, ' ')
        .trim() || null
    : null

/**
 * Every game under the ROMs folder: one subfolder per system ("ps2", "snes", "Mega Drive"…), unknown
 * folders ignored. Ids are paths relative to the ROMs folder, so moving the whole folder keeps playtime.
 */
export async function scanRoms(root: string, rpcs3Dir: string | null): Promise<RomGame[]> {
  const games: RomGame[] = []
  const add = (system: GameSystem, path: string, title: string, idBase: string) =>
    games.push({
      externalId: `${system.id}:${relative(idBase, path).replace(/\\/g, '/').toLowerCase()}`,
      title,
      folder: path,
      exePath: path,
      launchUri: null,
      platform: system.id
    })

  for (const d of await list(root)) {
    if (!d.isDirectory()) continue
    const system = systemForFolder(d.name)
    if (!system) continue
    const dir = join(root, d.name)
    if (system.id === 'ps3') {
      for (const g of await scanPs3Folder(dir)) add(system, g.path, g.title, root)
    } else {
      for (const f of await scanSystemFolder(dir, system)) add(system, f, romTitle(f), root)
    }
  }
  if (rpcs3Dir) {
    const ps3 = systemForFolder('ps3')!
    const known = new Set(games.filter((g) => g.platform === 'ps3').map((g) => g.title.toLowerCase()))
    for (const g of await scanRpcs3Hdd(rpcs3Dir)) {
      if (!known.has(g.title.toLowerCase())) add(ps3, g.path, g.title, rpcs3Dir)
    }
  }
  return games
}
