import { execFile, spawn } from 'child_process'
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

/** Executable paths of all running processes (Windows). */
function listProcessPaths(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object ExecutablePath | ForEach-Object { $_.ExecutablePath }'
      ],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([])
        resolve(stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
      }
    )
  })
}

export class Runner {
  private running = new Map<number, NodeJS.Timeout>()

  constructor(private hooks: RunnerHooks) {}

  isRunning(gameId: number): boolean {
    return this.running.has(gameId)
  }

  async launch(game: Game): Promise<void> {
    const exe = game.exeOverride ?? game.exePath
    if (!game.folder) throw new Error('Jogo não instalado')
    if (!exe) throw new Error('Nenhum executável encontrado para este jogo')
    const gameFolder = game.folder
    if (this.running.has(game.id)) throw new Error('Jogo já está rodando')

    await this.hooks.beforeLaunch?.(game)
    const startedAt = Date.now()

    if (process.platform !== 'win32') {
      // Dev stub on macOS/Linux: simulate a short session.
      console.log(`[runner] stub launch: ${exe}`)
      this.hooks.onStart(game, startedAt)
      const t = setTimeout(() => this.finish(game, startedAt), 3000)
      this.running.set(game.id, t)
      return
    }

    const child = spawn(exe, [], { cwd: dirname(exe), detached: true, stdio: 'ignore' })
    child.on('error', (e) => console.error('[runner] spawn error', e))
    child.unref()
    this.hooks.onStart(game, startedAt)

    const folder = gameFolder.toLowerCase().replace(/[\\/]+$/, '') + sep
    const tick = async (): Promise<void> => {
      const paths = await listProcessPaths()
      const alive = paths.some((p) => p.toLowerCase().startsWith(folder))
      const inGrace = Date.now() - startedAt < STARTUP_GRACE_MS
      if (alive || inGrace) {
        this.running.set(game.id, setTimeout(tick, POLL_MS))
      } else {
        await this.finish(game, startedAt)
      }
    }
    this.running.set(game.id, setTimeout(tick, POLL_MS))
  }

  private async finish(game: Game, startedAt: number): Promise<void> {
    this.running.delete(game.id)
    await this.hooks.afterExit?.(game)
    this.hooks.onEnd(game, startedAt, Date.now())
  }

  stopAll(): void {
    for (const t of this.running.values()) clearTimeout(t)
    this.running.clear()
  }
}
