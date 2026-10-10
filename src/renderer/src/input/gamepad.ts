import { inputBus, type Action } from './actions'
import { hidPads } from './hidPads'
import { setInputMode } from './mode'

// Standard Gamepad API mapping (DualSense via USB/BT in Chromium).
const BUTTONS: Record<number, Action> = {
  0: 'confirm', // ✕
  1: 'back', // ○
  2: 'secondary', // □
  3: 'details', // △
  4: 'pageLeft', // L1
  5: 'pageRight', // R1
  7: 'submit', // R2
  9: 'options', // Options
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right'
}
const REPEATABLE = new Set<Action>(['up', 'down', 'left', 'right', 'pageLeft', 'pageRight', 'secondary'])
const DEADZONE = 0.5
const REPEAT_DELAY = 350
const REPEAT_RATE = 90

const SONY_VENDOR = /054c/i

export interface PadStatus {
  connected: boolean
  name: string | null
}

type StatusListener = (s: PadStatus) => void

/** Gamepad API pad or a Sony pad read over WebHID, in the standard mapping. */
interface Pad {
  id: string
  buttons: boolean[]
  axes: readonly number[]
}

/**
 * Pads to read. If any Sony pad is connected, ignore the rest — in Marco 2 the input
 * helper (and Steam Input) exposes a virtual Xbox 360 pad that must not drive the launcher twice.
 * Sony pads the Gamepad API misses (DualSense over Bluetooth on Windows) come from WebHID.
 */
function activePads(): Pad[] {
  const pads: Pad[] = navigator
    .getGamepads()
    .filter((p): p is Gamepad => !!p && p.connected)
    .map((p) => ({ id: p.id, buttons: p.buttons.map((b) => b.pressed), axes: p.axes }))
  let sony = pads.filter((p) => SONY_VENDOR.test(p.id))
  if (!sony.length) sony = hidPads().map((h) => ({ id: h.id, ...h.state }))
  return sony.length ? sony : pads
}

function pressedActions(pad: Pad): Set<Action> {
  const out = new Set<Action>()
  for (const [idx, action] of Object.entries(BUTTONS)) {
    if (pad.buttons[Number(idx)]) out.add(action)
  }
  const [x = 0, y = 0] = pad.axes
  if (x < -DEADZONE) out.add('left')
  if (x > DEADZONE) out.add('right')
  if (y < -DEADZONE) out.add('up')
  if (y > DEADZONE) out.add('down')
  return out
}

export function startGamepadLoop(onStatus: StatusListener): () => void {
  const held = new Map<Action, number>() // action → next fire timestamp
  let raf = 0
  let lastStatus = ''

  const loop = (now: number) => {
    const pads = activePads()
    const status: PadStatus = { connected: pads.length > 0, name: pads[0]?.id ?? null }
    const key = `${status.connected}|${status.name}`
    if (key !== lastStatus) {
      lastStatus = key
      onStatus(status)
    }

    const pressed = new Set<Action>()
    for (const p of pads) pressedActions(p).forEach((a) => pressed.add(a))

    for (const a of pressed) {
      const next = held.get(a)
      if (next === undefined) {
        setInputMode('pad')
        inputBus.emit(a)
        held.set(a, REPEATABLE.has(a) ? now + REPEAT_DELAY : Infinity)
      } else if (now >= next) {
        inputBus.emit(a)
        held.set(a, now + REPEAT_RATE)
      }
    }
    for (const a of [...held.keys()]) if (!pressed.has(a)) held.delete(a)

    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}
