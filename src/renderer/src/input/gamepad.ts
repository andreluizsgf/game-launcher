import { inputBus, type Action } from './actions'
import { hidPads, liveHidPads } from './hidPads'
import { setInputMode } from './mode'

// Standard Gamepad API mapping (DualSense via USB/BT in Chromium).
const BUTTONS: Record<number, Action> = {
  0: 'confirm', // ✕
  1: 'back', // ○
  2: 'secondary', // □
  3: 'details', // △
  4: 'pageLeft', // L1
  5: 'pageRight', // R1
  6: 'triggerLeft', // L2
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
 *
 * Sony pads come from WebHID whenever it's receiving reports: Chromium's Gamepad API can list a
 * DualSense yet return frozen zeros (connected over Bluetooth after launch, or switched by Steam to
 * a report format Chromium doesn't decode). HID parses every format, so it wins while it's live.
 */
function activePads(): Pad[] {
  const live = liveHidPads()
  if (live.length) return live.map((h) => ({ id: h.id, ...h.state }))
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

const GUIDE = 16 // PS button in the standard mapping
/** Background polling rate: requestAnimationFrame stops while the window is minimized. */
const BACKGROUND_POLL_MS = 50

/**
 * PS button on any Sony pad. HID reports keep arriving while the launcher is in the background,
 * which is what lets the button open the in-game quick menu.
 */
function guidePressed(pads: Pad[]): boolean {
  return pads.some((p) => p.buttons[GUIDE]) || hidPads().some((h) => h.state.buttons[GUIDE])
}

export function startGamepadLoop(onStatus: StatusListener, onGuide: () => void): () => void {
  const held = new Map<Action, number>() // action → next fire timestamp
  let raf = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastStatus = ''
  let guideHeld = false

  const schedule = () => {
    if (document.hidden) timer = setTimeout(() => loop(performance.now()), BACKGROUND_POLL_MS)
    else raf = requestAnimationFrame(loop)
  }

  const loop = (now: number) => {
    const pads = activePads()
    const status: PadStatus = { connected: pads.length > 0, name: pads[0]?.id ?? null }
    const key = `${status.connected}|${status.name}`
    if (key !== lastStatus) {
      lastStatus = key
      onStatus(status)
    }

    const guide = guidePressed(pads)
    if (guide && !guideHeld) onGuide()
    guideHeld = guide

    // While a game has focus, the launcher's screens must not react to the pad.
    const pressed = new Set<Action>()
    if (document.hasFocus()) for (const p of pads) pressedActions(p).forEach((a) => pressed.add(a))

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

    schedule()
  }
  schedule()
  return () => {
    cancelAnimationFrame(raf)
    clearTimeout(timer)
  }
}
