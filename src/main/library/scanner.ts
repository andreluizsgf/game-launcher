import { promises as fs } from 'fs'
import { join } from 'path'
import { pickExe, pickInstaller, titleFromFolder, type ExeCandidate } from './exePicker'

export interface ScannedGame {
  folder: string // absolute path
  title: string
  exePath: string | null // absolute
  installerPath: string | null // absolute
  coverPath: string | null
}

/** 4 levels: downloads add one (<games>/<title>/<release folder>/bin/game.exe). */
const MAX_DEPTH = 4
const COVER_NAMES = ['cover.jpg', 'cover.png', 'cover.webp', 'folder.jpg', 'folder.png']

async function collectExes(root: string, rel = '', depth = 0, out: ExeCandidate[] = []): Promise<ExeCandidate[]> {
  let entries
  try {
    entries = await fs.readdir(join(root, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory() && depth < MAX_DEPTH) {
      await collectExes(root, childRel, depth + 1, out)
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
      try {
        const st = await fs.stat(join(root, childRel))
        out.push({ relPath: childRel, size: st.size })
      } catch {
        // unreadable file, skip
      }
    }
  }
  return out
}

async function findCover(folder: string): Promise<string | null> {
  let names: string[]
  try {
    names = await fs.readdir(folder)
  } catch {
    return null
  }
  const lower = new Map(names.map((n) => [n.toLowerCase(), n]))
  for (const c of COVER_NAMES) {
    const hit = lower.get(c)
    if (hit) return join(folder, hit)
  }
  return null
}

/** Each direct subfolder of `root` is one game. */
export async function scanRoot(root: string): Promise<ScannedGame[]> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  return Promise.all(
    dirs.map(async (d) => {
      const folder = join(root, d.name)
      const exes = await collectExes(folder)
      const exe = pickExe(exes, d.name)
      const installer = pickInstaller(exes)
      const abs = (c: ExeCandidate | null) => (c ? join(folder, ...c.relPath.split('/')) : null)
      return {
        folder,
        title: titleFromFolder(d.name),
        exePath: abs(exe),
        installerPath: abs(installer),
        coverPath: await findCover(folder)
      }
    })
  )
}
