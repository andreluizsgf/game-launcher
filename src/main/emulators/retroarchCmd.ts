import { createSocket } from 'dgram'
import type { EmulatorAction } from '@shared/types'
import { RETROARCH_CMD_PORT } from './launch'

const COMMAND: Record<EmulatorAction, string> = {
  saveState: 'SAVE_STATE',
  loadState: 'LOAD_STATE',
  fastForward: 'FAST_FORWARD',
  menu: 'MENU_TOGGLE'
}

/** Sends one command to the RetroArch running on this PC (fire-and-forget: it doesn't answer these). */
export function sendRetroArch(action: EmulatorAction): Promise<void> {
  const socket = createSocket('udp4')
  return new Promise((resolve, reject) =>
    socket.send(COMMAND[action], RETROARCH_CMD_PORT, '127.0.0.1', (err) => {
      socket.close()
      if (err) reject(err)
      else resolve()
    })
  )
}
