import { describe, expect, it } from 'vitest'
import type { PadInfo } from './gamepad'
import { padNotices } from './padNotices'

const pad = (level: number | null, charging = false): PadInfo => ({
  name: 'DualSense',
  battery: level == null ? null : { level, charging }
})
const status = (...pads: PadInfo[]) => ({ pads })

describe('padNotices', () => {
  it('announces pads coming and going, numbering the second one', () => {
    const w = new Set<number>()
    expect(padNotices(status(), status(pad(80)), w)).toEqual(['Controle conectado'])
    expect(padNotices(status(pad(80)), status(pad(80), pad(null)), w)).toEqual(['Controle 2 conectado'])
    expect(padNotices(status(pad(80), pad(null)), status(pad(80)), w)).toEqual([
      'Um controle desconectou (1 conectado)'
    ])
    expect(padNotices(status(pad(80)), status(), w)).toEqual(['Controle desconectado'])
  })

  it('warns once per discharge, per pad, and again after charging', () => {
    const w = new Set<number>()
    const two = (a: PadInfo, b: PadInfo) => status(a, b)
    expect(padNotices(two(pad(80), pad(30)), two(pad(80), pad(20)), w)).toEqual(['Bateria do controle 2 fraca (20%)'])
    expect(padNotices(two(pad(80), pad(20)), two(pad(80), pad(10)), w)).toEqual([])
    expect(padNotices(two(pad(80), pad(10)), two(pad(80), pad(10, true)), w)).toEqual([])
    expect(padNotices(two(pad(80), pad(10, true)), two(pad(80), pad(10)), w)).toEqual([
      'Bateria do controle 2 fraca (10%)'
    ])
  })

  it('leaves pads without a battery reading alone', () => {
    expect(padNotices(status(pad(null)), status(pad(null)), new Set())).toEqual([])
  })
})
