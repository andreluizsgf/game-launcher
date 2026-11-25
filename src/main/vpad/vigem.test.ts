import { describe, expect, it } from 'vitest'
import { IOCTL, packPlugin, packSizeAnd, packXusb, parseMultiSz } from './vigem'

describe('ViGEmBus protocol', () => {
  it('builds the IOCTL codes of BusShared.h', () => {
    expect(IOCTL.plugin).toBe(0x2aa004)
    expect(IOCTL.unplug).toBe(0x2aa008)
    expect(IOCTL.checkVersion).toBe(0x2aa00c)
    expect(IOCTL.waitReady).toBe(0x2aa010)
    expect(IOCTL.xusbSubmit).toBe(0x2aa808)
  })

  it('packs VIGEM_PLUGIN_TARGET as an Xbox 360 wired pad', () => {
    expect([...packPlugin(3)]).toEqual([16, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0x5e, 0x04, 0x8e, 0x02])
  })

  it('packs the size + serial structs', () => {
    expect([...packSizeAnd(1)]).toEqual([8, 0, 0, 0, 1, 0, 0, 0])
  })

  it('packs XUSB_SUBMIT_REPORT, clamping out-of-range values', () => {
    const b = packXusb(2, { buttons: 0x1001, leftTrigger: 300, rightTrigger: 7, lx: -40000, ly: 32767, rx: 1, ry: -1 })
    expect(b.length).toBe(20)
    expect(b.readUInt32LE(0)).toBe(20)
    expect(b.readUInt32LE(4)).toBe(2)
    expect(b.readUInt16LE(8)).toBe(0x1001)
    expect([b[10], b[11]]).toEqual([255, 7])
    expect([b.readInt16LE(12), b.readInt16LE(14), b.readInt16LE(16), b.readInt16LE(18)]).toEqual([-32768, 32767, 1, -1])
  })

  it('reads the device interface list', () => {
    expect(parseMultiSz(Buffer.from('\\\\?\\ROOT#SYSTEM#0001#{96e4}\0\0', 'utf16le'))).toEqual([
      '\\\\?\\ROOT#SYSTEM#0001#{96e4}'
    ])
  })
})
