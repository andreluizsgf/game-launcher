import { ipcMain } from 'electron'
import type { Result } from '@shared/types'

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const fail = (err: unknown): Result<never> => ({
  ok: false,
  error: err instanceof Error ? err.message : String(err)
})

/** Registers a channel whose thrown errors reach the renderer as `{ ok: false, error }`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handle<A extends any[], T>(channel: string, fn: (...args: A) => T | Promise<T>): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return ok((await fn(...(args as A))) ?? null)
    } catch (err) {
      return fail(err)
    }
  })
}
