import { useEffect, useRef, useState } from 'react'
import { startGamepadLoop, type PadStatus } from '../input/gamepad'
import { startHidPads } from '../input/hidPads'
import { startKeyboard } from '../input/keyboard'
import { startMouseTracking } from '../input/mode'
import { padNotices } from '../input/padNotices'

/** Starts pad (Gamepad API + HID), keyboard and mouse input; `onGuide` fires on the PS button. */
export function useInputDevices(notify: (msg: string) => void, onGuide: () => void): PadStatus {
  const [pad, setPad] = useState<PadStatus>({ pads: [] })
  // Latest handler without restarting the loops on every render.
  const guide = useRef(onGuide)
  guide.current = onGuide

  useEffect(() => {
    let prev: PadStatus = { pads: [] }
    const warned = new Set<number>()
    const stopPad = startGamepadLoop(
      (s) => {
        setPad(s)
        padNotices(prev, s, warned).forEach(notify)
        prev = s
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
