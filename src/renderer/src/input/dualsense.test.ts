import { describe, expect, it } from 'vitest'
import { parseBattery, parseReport } from './dualsense'

const view = (bytes: number[]) => new DataView(new Uint8Array(bytes).buffer)
const CROSS = 0,
  CIRCLE = 1,
  L1 = 4,
  OPTIONS = 9,
  UP = 12,
  RIGHT = 15,
  PS = 16

describe('parseReport', () => {
  it('reads the USB report', () => {
    const data = new Array(63).fill(0)
    data.splice(0, 4, 128, 0, 128, 255) // left stick up, right stick down
    data[7] = 0x20 | 0x02 // ✕ + d-pad east
    data[8] = 0x01 | 0x20 // L1 + Options
    data[9] = 0x01 // PS
    const s = parseReport(0x01, view(data))!
    expect(s.axes[1]).toBe(-1)
    expect(s.axes[3]).toBeCloseTo(0.99, 2)
    expect(s.buttons[CROSS]).toBe(true)
    expect(s.buttons[RIGHT]).toBe(true)
    expect(s.buttons[UP]).toBe(false)
    expect(s.buttons[L1]).toBe(true)
    expect(s.buttons[OPTIONS]).toBe(true)
    expect(s.buttons[PS]).toBe(true)
  })

  it('reads the Bluetooth simple report', () => {
    const s = parseReport(0x01, view([128, 128, 128, 128, 0x40 | 0x08, 0, 0, 0, 0]))!
    expect(s.buttons[CIRCLE]).toBe(true)
    expect(s.buttons.slice(12, 16)).toEqual([false, false, false, false]) // hat 8 = released
  })

  it('reads the Bluetooth full report', () => {
    const data = new Array(77).fill(0)
    data.splice(1, 4, 0, 128, 128, 128) // left stick left
    data[8] = 0x20 | 0x07 // ✕ + d-pad north-west
    const s = parseReport(0x31, view(data))!
    expect(s.axes[0]).toBe(-1)
    expect(s.buttons[CROSS]).toBe(true)
    expect(s.buttons[UP]).toBe(true)
    expect(s.buttons[14]).toBe(true)
  })

  it('ignores other reports', () => {
    expect(parseReport(0x05, view(new Array(40).fill(0)))).toBeNull()
  })
})

describe('parseBattery', () => {
  const usb = (status: number) => {
    const data = new Array(63).fill(0)
    data[52] = status
    return view(data)
  }

  it('reads level and charging from the USB report', () => {
    expect(parseBattery(0x01, usb(0x07))).toEqual({ level: 70, charging: false })
    expect(parseBattery(0x01, usb(0x13))).toEqual({ level: 30, charging: true })
    expect(parseBattery(0x01, usb(0x2a))).toEqual({ level: 100, charging: false })
  })

  it('reads the Bluetooth full report, one byte further', () => {
    const data = new Array(77).fill(0)
    data[53] = 0x05
    expect(parseBattery(0x31, view(data))).toEqual({ level: 50, charging: false })
  })

  it('has nothing in the Bluetooth simple report, nor on battery errors', () => {
    expect(parseBattery(0x01, view([128, 128, 128, 128, 8, 0, 0, 0, 0]))).toBeNull()
    expect(parseBattery(0x01, usb(0xa5))).toBeNull()
  })
})
