import { describe, expect, it } from 'vitest'
import { NEUTRAL_XUSB, sameXusb, toXusb, XUSB } from './xusb'

const buttons = (...on: number[]) => Array.from({ length: 17 }, (_, i) => on.includes(i))

describe('toXusb', () => {
  it('maps face, shoulder, menu and d-pad buttons', () => {
    const r = toXusb({ buttons: buttons(0, 3, 4, 8, 9, 11, 12, 15), axes: [0, 0, 0, 0], triggers: [0, 0] })
    expect(r.buttons).toBe(
      XUSB.a | XUSB.y | XUSB.leftShoulder | XUSB.back | XUSB.start | XUSB.rightThumb | XUSB.up | XUSB.right
    )
  })

  it('leaves the PS button to the launcher', () => {
    expect(toXusb({ buttons: buttons(16), axes: [0, 0, 0, 0], triggers: [0, 0] }).buttons).toBe(0)
  })

  it('flips Y so up is positive, and scales the sticks', () => {
    const r = toXusb({ buttons: [], axes: [-1, -1, 1, 1], triggers: [0, 0] })
    expect(r).toMatchObject({ lx: -32767, ly: 32767, rx: 32767, ry: -32767 })
  })

  it('uses analog triggers, or the digital L2/R2 when there are none', () => {
    expect(toXusb({ buttons: [], axes: [], triggers: [0.5, 1] })).toMatchObject({ leftTrigger: 128, rightTrigger: 255 })
    expect(toXusb({ buttons: buttons(7), axes: [] })).toMatchObject({ leftTrigger: 0, rightTrigger: 255 })
  })

  it('is neutral at rest', () => {
    const r = toXusb({ buttons: buttons(), axes: [0, 0, 0, 0], triggers: [0, 0] })
    expect(sameXusb(r, NEUTRAL_XUSB)).toBe(true)
  })
})
