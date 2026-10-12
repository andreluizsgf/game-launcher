import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { dirname } from 'path'

/** Subfolder of the game folder the repack installs into, so its own files can be deleted afterwards. */
export const INSTALL_DIR = 'Jogo'

/** Repacks are almost always Inno Setup, which takes the install folder on the command line. */
async function isInnoSetup(exe: string): Promise<boolean> {
  try {
    const st = await fs.stat(exe)
    if (st.size > 64 * 1024 * 1024) return false
    return (await fs.readFile(exe)).includes('Inno Setup')
  } catch {
    return false
  }
}

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Command-line arguments for the installer: the target folder when the installer understands it. */
export async function installerArgs(exe: string, targetDir: string): Promise<string[]> {
  return (await isInnoSetup(exe)) ? [`/DIR="${targetDir}"`] : []
}

/**
 * Runs the installer and resolves when it closes. Start-Process goes through ShellExecute, so installers
 * that need admin get their UAC prompt (a plain spawn fails with "elevation required"), and -Wait still
 * follows the elevated process.
 */
export async function runInstaller(exe: string, targetDir: string): Promise<void> {
  if (process.platform !== 'win32') {
    console.log(`[installer] stub: ${exe} → ${targetDir}`)
    return new Promise((r) => setTimeout(r, Number(process.env.GL_STUB_SECONDS ?? 3) * 1000))
  }
  const args = await installerArgs(exe, targetDir)
  const command = [
    `Start-Process -FilePath ${psQuote(exe)} -WorkingDirectory ${psQuote(dirname(exe))}`,
    args.length ? `-ArgumentList ${args.map(psQuote).join(',')}` : '',
    '-Wait'
  ].join(' ')
  await new Promise<void>((resolve, reject) =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true },
      (err, _out, stderr) => {
        // Declining the UAC prompt lands here too.
        if (err) reject(new Error(/cancel/i.test(stderr) ? 'Instalação cancelada' : stderr.trim() || err.message))
        else resolve()
      }
    )
  )
}
