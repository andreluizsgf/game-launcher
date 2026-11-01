import { useEffect, useRef, useState } from 'react'
import { startGamepadLoop, type PadStatus } from '../input/gamepad'
import { startHidPads } from '../input/hidPads'
import { startKeyboard } from '../input/keyboard'
import { startMouseTracking } from '../input/mode'

/** At or below this (and not charging) the battery shows red and a toast warns once. */
export const LOW_BATTERY = 20

/** Starts pad (Gamepad API + HID), keyboard and mouse input; `onGuide` fires on the PS button. */
export function useInputDevices(notify: (msg: string) => void, onGuide: () => void): PadStatus {
  const [pad, setPad] = useState<PadStatus>({ connected: false, name: null, battery: null })
  // Latest handler without restarting the loops on every render.
  const guide = useRef(onGuide)
  guide.current = onGuide

  useEffect(() => {
    let prev = false
    let warnedLow = false
    const stopPad = startGamepadLoop(
      (s) => {
        setPad(s)
        if (s.connected !== prev) notify(s.connected ? 'Controle conectado' : 'Controle desconectado')
        prev = s.connected
        // Once per discharge: re-armed when it charges back above the threshold.
        const low = !!s.battery && !s.battery.charging && s.battery.level <= LOW_BATTERY
        if (low && !warnedLow) notify(`Bateria do controle fraca (${s.battery!.level}%)`)
        if (s.battery && (s.battery.charging || s.battery.level > LOW_BATTERY)) warnedLow = false
        else if (low) warnedLow = true
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
