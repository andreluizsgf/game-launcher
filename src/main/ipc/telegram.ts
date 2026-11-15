import { ipcMain } from 'electron'
import type { TgSystem } from '@shared/types'
import { publicSettings } from '../settings'
import type { IpcContext } from './context'
import { handle } from './result'

/** Telegram login, game queries and acting on the replies (links, files, bot buttons/commands). */
export function registerTelegram({ telegram, settings }: IpcContext): void {
  handle('telegram:loginPhone', (phone: string) => telegram.loginPhone(phone))
  handle('telegram:loginCode', (code: string) => telegram.loginCode(code))
  handle('telegram:loginPassword', (password: string) => telegram.loginPassword(password))
  ipcMain.handle('telegram:logout', async () => {
    await telegram.logout()
    return publicSettings(settings)
  })

  handle('telegram:query', (title: string, force?: boolean, igdbId?: number | null, system?: TgSystem) =>
    telegram.query(title, force, igdbId ?? null, system === 'ps2' ? 'ps2' : 'pc')
  )
  handle('telegram:openLink', (url: string) => telegram.openLink(url))
  handle('telegram:download', (msgId: number) => telegram.download(msgId))
  handle('telegram:command', (command: string) => telegram.command(command))
  handle('telegram:press', (msgId: number, row: number, col: number) => telegram.press(msgId, row, col))
}
