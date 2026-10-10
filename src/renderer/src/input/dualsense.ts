/**
 * DualSense HID input reports → standard-gamepad-shaped state, for when Chromium's Gamepad API
 * doesn't expose the pad (common over Bluetooth on Windows). Layouts follow Linux hid-playstation.
 * WebHID strips the report id, so offsets below are relative to the payload.
 */

export interface PadState {
  /** Standard Gamepad mapping indices (0 ✕, 1 ○, 2 □, 3 △, 4 L1, 5 R1, 6 L2, 7 R2, 8 Create, 9 Options, 10 L3, 11 R3, 12–15 d-pad, 16 PS). */
  buttons: boolean[]
  /** Left X, left Y, right X, right Y in −1..1. */
  axes: number[]
}

export const SONY_VENDOR_ID = 0x054c

/** Payload offsets of the sticks and the first button byte, or null for reports we don't read. */
function offsets(reportId: number, length: number): { sticks: number; buttons: number } | null {
  if (reportId === 0x01) {
    // USB full report (63 bytes): sticks, L2, R2, seq, buttons.
    // Bluetooth "simple" report (9 bytes, before any app enables full mode): sticks, buttons, L2, R2.
    return length > 16 ? { sticks: 0, buttons: 7 } : { sticks: 0, buttons: 4 }
  }
  // Bluetooth full report (after Steam & co. switch the pad to it): one extra byte first.
  if (reportId === 0x31) return { sticks: 1, buttons: 8 }
  return null
}

/** Hat values 0–7 clockwise from north; 8 = released. */
const HAT: Record<number, [up: boolean, right: boolean, down: boolean, left: boolean]> = {
  0: [true, false, false, false],
  1: [true, true, false, false],
  2: [false, true, false, false],
  3: [false, true, true, false],
  4: [false, false, true, false],
  5: [false, false, true, true],
  6: [false, false, false, true],
  7: [true, false, false, true]
}

export function parseReport(reportId: number, data: DataView): PadState | null {
  const at = offsets(reportId, data.byteLength)
  if (!at || data.byteLength < at.buttons + 3) return null
  const axis = (i: number) => (data.getUint8(at.sticks + i) - 128) / 128
  const b0 = data.getUint8(at.buttons)
  const b1 = data.getUint8(at.buttons + 1)
  const b2 = data.getUint8(at.buttons + 2)
  const [up, right, down, left] = HAT[b0 & 0x0f] ?? [false, false, false, false]
  const bit = (v: number, n: number) => (v & (1 << n)) !== 0
  return {
    axes: [axis(0), axis(1), axis(2), axis(3)],
    buttons: [
      bit(b0, 5), // ✕
      bit(b0, 6), // ○
      bit(b0, 4), // □
      bit(b0, 7), // △
      bit(b1, 0), // L1
      bit(b1, 1), // R1
      bit(b1, 2), // L2
      bit(b1, 3), // R2
      bit(b1, 4), // Create
      bit(b1, 5), // Options
      bit(b1, 6), // L3
      bit(b1, 7), // R3
      up,
      down,
      left,
      right,
      bit(b2, 0) // PS
    ]
  }
}
