import { useEffect, useRef, useState } from 'react'
import { startGamepadLoop, type PadStatus } from '../input/gamepad'
import { startHidPads } from '../input/hidPads'
import { startKeyboard } from '../input/keyboard'
import { startMouseTracking } from '../input/mode'

/** Starts pad (Gamepad API + HID), keyboard and mouse input; `onGuide` fires on the PS button. */
export function useInputDevices(notify: (msg: string) => void, onGuide: () => void): PadStatus {
  const [pad, setPad] = useState<PadStatus>({ connected: false, name: null })
  // Latest handler without restarting the loops on every render.
  const guide = useRef(onGuide)
  guide.current = onGuide

  useEffect(() => {
    let prev = false
    const stopPad = startGamepadLoop(
      (s) => {
        setPad(s)
        if (s.connected !== prev) notify(s.connected ? 'Controle conectado' : 'Controle desconectado')
        prev = s.connected
      },
      () => guide.current()
    )
    const stopHid = startHidPads()
    const stopKb = startKeyboard()
    const stopMouse = startMouseTracking()
    return () => {
      stopPad()
      stopHid()
      stopKb()
      stopMouse()
    }
  }, [notify])

  return pad
}
