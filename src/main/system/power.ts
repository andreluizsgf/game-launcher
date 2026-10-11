import { execFile } from 'child_process'

export type PowerAction = 'sleep' | 'restart' | 'shutdown'

/** Windows commands per action. Sleep goes through SetSuspendState('Suspend'): rundll32's
 *  SetSuspendState hibernates instead when hibernation is enabled. */
export function powerCommand(action: PowerAction): [string, string[]] {
  switch (action) {
    case 'shutdown':
      return ['shutdown', ['/s', '/t', '0']]
    case 'restart':
      return ['shutdown', ['/r', '/t', '0']]
    case 'sleep':
      return [
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"
        ]
      ]
  }
}

export function runPower(action: PowerAction): Promise<void> {
  if (process.platform !== 'win32') return Promise.reject(new Error('Disponível só no Windows'))
  const [cmd, args] = powerCommand(action)
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { windowsHide: true }, (err) => (err ? reject(err) : resolve()))
  )
}
