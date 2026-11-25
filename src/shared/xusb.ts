/**
 * DualSense state → Xbox 360 (XUSB) report, for games that only read XInput (ADR 0018).
 * Same layout as XInput's XINPUT_GAMEPAD; the renderer maps, the main process hands it to ViGEmBus.
 */

export interface XusbReport {
  /** XUSB_BUTTON bits. */
  buttons: number
  /** 0–255. */
  leftTrigger: number
  rightTrigger: number
  /** −32768..32767, up is positive (XInput), unlike the HID sticks. */
  lx: number
  ly: number
  rx: number
  ry: number
}

export const XUSB = {
  up: 0x0001,
  down: 0x0002,
  left: 0x0004,
  right: 0x0008,
  start: 0x0010,
  back: 0x0020,
  leftThumb: 0x0040,
  rightThumb: 0x0080,
  leftShoulder: 0x0100,
  rightShoulder: 0x0200,
  guide: 0x0400,
  a: 0x1000,
  b: 0x2000,
  x: 0x4000,
  y: 0x8000
} as const

export const NEUTRAL_XUSB: XusbReport = { buttons: 0, leftTrigger: 0, rightTrigger: 0, lx: 0, ly: 0, rx: 0, ry: 0 }

/** Pad state as the renderer reads it (standard Gamepad indices, axes −1..1, triggers 0..1). */
export interface PadInput {
  buttons: boolean[]
  axes: number[]
  triggers?: number[]
}

/** Standard Gamepad index → XUSB bit. PS (16) stays out: it's the launcher's button (ADR 0008). */
const BUTTON_BITS: [index: number, bit: number][] = [
  [0, XUSB.a], // ✕
  [1, XUSB.b], // ○
  [2, XUSB.x], // □
  [3, XUSB.y], // △
  [4, XUSB.leftShoulder],
  [5, XUSB.rightShoulder],
  [8, XUSB.back], // Create
  [9, XUSB.start], // Options
  [10, XUSB.leftThumb],
  [11, XUSB.rightThumb],
  [12, XUSB.up],
  [13, XUSB.down],
  [14, XUSB.left],
  [15, XUSB.right]
]

const stick = (v: number | undefined) => Math.max(-32768, Math.min(32767, Math.round((v ?? 0) * 32767)))
const trigger = (v: number | undefined) => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255)))

export function toXusb(pad: PadInput): XusbReport {
  let buttons = 0
  for (const [i, bit] of BUTTON_BITS) if (pad.buttons[i]) buttons |= bit
  // Without analog values (Bluetooth simple report), the digital L2/R2 still pull the trigger all the way.
  const lt = pad.triggers?.[0] ?? (pad.buttons[6] ? 1 : 0)
  const rt = pad.triggers?.[1] ?? (pad.buttons[7] ? 1 : 0)
  return {
    buttons,
    leftTrigger: trigger(lt),
    rightTrigger: trigger(rt),
    lx: stick(pad.axes[0]),
    ly: stick(-(pad.axes[1] ?? 0)),
    rx: stick(pad.axes[2]),
    ry: stick(-(pad.axes[3] ?? 0))
  }
}

export function sameXusb(a: XusbReport, b: XusbReport): boolean {
  return (
    a.buttons === b.buttons &&
    a.leftTrigger === b.leftTrigger &&
    a.rightTrigger === b.rightTrigger &&
    a.lx === b.lx &&
    a.ly === b.ly &&
    a.rx === b.rx &&
    a.ry === b.ry
  )
}
