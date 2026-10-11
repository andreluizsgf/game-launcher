import { execFile, spawn } from 'child_process'
import { shell } from 'electron'
import { dirname, sep } from 'path'
import type { Game } from '@shared/types'

export interface RunnerHooks {
  /** Marco 2: activates the controller profile in the input helper. */
  beforeLaunch?(game: Game): Promise<void> | void
  /** Marco 2: deactivates the controller profile. */
  afterExit?(game: Game): Promise<void> | void
  onStart(game: Game, startedAt: number): void
  onEnd(game: Game, startedAt: number, endedAt: number): void
}

const POLL_MS = 5000
/** Grace period for launcher stubs that exit before the real game process shows up. */
const STARTUP_GRACE_MS = 20000
/** Store launches may start Steam/Epic, sync saves or patch first. */
const STORE_GRACE_MS = 120000

interface Proc {
  pid: number
  path: string
}

/** Running processes with an executable path (Windows). */
function listProcesses(): Promise<Proc[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object ExecutablePath | ForEach-Object { "$($_.ProcessId)|$($_.ExecutablePath)" }'
      ],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([])
        resolve(
          stdout
            .split(/\r?\n/)
            .map((l) => {
              const i = l.indexOf('|')
              return { pid: Number(l.slice(0, i)), path: l.slice(i + 1).trim() }
            })
            .filter((p) => p.pid > 0 && p.path)
        )
      }
    )
  })
}

/** Processes started from inside a game folder (the exe, launcher stubs, child processes…). */
const inFolder = (folder: string) => (p: Proc) => p.path.toLowerCase().startsWith(folder)
const folderKey = (folder: string) => folder.toLowerCase().replace(/[\\/]+$/, '') + sep

export class Runner {
  private running = new Map<number, NodeJS.Timeout>()
  private games = new Map<number, { game: Game; startedAt: number }>()

  constructor(private hooks: RunnerHooks) {}

  isRunning(gameId: number): boolean {
    return this.running.has(gameId)
  }

  async launch(game: Game): Promise<void> {
    const exe = game.exeOverride ?? game.exePath
    if (!game.folder) throw new Error('Jogo não instalado')
    if (!exe && !game.launchUri) throw new Error('Nenhum executável encontrado para este jogo')
    const gameFolder = game.folder
    if (this.running.has(game.id)) throw new Error('Jogo já está rodando')

    await this.hooks.beforeLaunch?.(game)
    const startedAt = Date.now()
    this.games.set(game.id, { game, startedAt })

    if (process.platform !== 'win32') {
      // Dev stub on macOS/Linux: simulate a short session.
      console.log(`[runner] stub launch: ${game.launchUri ?? exe}`)
      this.hooks.onStart(game, startedAt)
      const t = setTimeout(() => this.finish(game, startedAt), Number(process.env.GL_STUB_SECONDS ?? 3) * 1000)
      this.running.set(game.id, t)
      return
    }

    if (game.launchUri) {
      // Steam/Epic start the game themselves (DRM, cloud saves, updates); we still track it by folder.
      await shell.openExternal(game.launchUri)
    } else {
      const child = spawn(exe!, [], { cwd: dirname(exe!), detached: true, stdio: 'ignore' })
      child.on('error', (e) => console.error('[runner] spawn error', e))
      child.unref()
    }
    this.hooks.onStart(game, startedAt)

    const folder = folderKey(gameFolder)
    const tick = async (): Promise<void> => {
      const alive = (await listProcesses()).some(inFolder(folder))
      if (!this.games.has(game.id)) return // stopped while listing
      const inGrace = Date.now() - startedAt < (game.launchUri ? STORE_GRACE_MS : STARTUP_GRACE_MS)
      if (alive || inGrace) {
        this.running.set(game.id, setTimeout(tick, POLL_MS))
      } else {
        await this.finish(game, startedAt)
      }
    }
    this.running.set(game.id, setTimeout(tick, POLL_MS))
  }

  /** Id of the game being played, if any. */
  current(): number | null {
    return this.games.keys().next().value ?? null
  }

  /**
   * Force-closes every process running from the game's folder (whole trees), then ends the session.
   * Games ignore polite close requests more often than not, so this is taskkill /F.
   */
  async stop(gameId: number): Promise<void> {
    const entry = this.games.get(gameId)
    if (!entry) throw new Error('Esse jogo não está rodando')
    clearTimeout(this.running.get(gameId))
    if (process.platform === 'win32' && entry.game.folder) {
      const procs = (await listProcesses()).filter(inFolder(folderKey(entry.game.folder)))
      await Promise.all(
        procs.map(
          (p) =>
            new Promise<void>((resolve) =>
              execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }, () => resolve())
            )
        )
      )
    }
    await this.finish(entry.game, entry.startedAt)
  }

  private async finish(game: Game, startedAt: number): Promise<void> {
    if (!this.games.has(game.id)) return
    this.games.delete(game.id)
    this.running.delete(game.id)
    await this.hooks.afterExit?.(game)
    this.hooks.onEnd(game, startedAt, Date.now())
  }

  stopAll(): void {
    for (const t of this.running.values()) clearTimeout(t)
    this.running.clear()
    this.games.clear()
  }
}
