import { describe, expect, it } from 'vitest'
import { applyPcsx2Settings, iniAdd, iniSet, iniValues } from './pcsx2'

const existing = `[UI]
; keep me
StartFullscreen = true

[InputSources]
SDL = false

[Pad1]
Type = DualShock2

[Hotkeys]
SaveStateToSlot = Keyboard/F1
`

describe('ini editing', () => {
  it('sets and adds values without touching the rest', () => {
    let t = iniSet(existing, 'InputSources', 'SDL', 'true')
    t = iniAdd(t, 'Hotkeys', 'SaveStateToSlot', 'Keyboard/F1')
    t = iniAdd(t, 'Hotkeys', 'SaveStateToSlot', 'SDL-0/Back & SDL-0/RightShoulder')
    t = iniSet(t, 'NewSection', 'A', '1')
    expect(t).toContain('; keep me\nStartFullscreen = true')
    expect(t).toContain('SDL = true')
    expect(t).not.toContain('SDL = false')
    expect(iniValues(t, 'Hotkeys').map((l) => l.value)).toEqual(['Keyboard/F1', 'SDL-0/Back & SDL-0/RightShoulder'])
    expect(t.trimEnd().endsWith('[NewSection]\nA = 1')).toBe(true)
  })
})

describe('applyPcsx2Settings', () => {
  it('maps the DualSense on an unmapped port 1 and adds the hotkeys, idempotently', () => {
    const once = applyPcsx2Settings(existing)
    const pad = Object.fromEntries(iniValues(once, 'Pad1').map((l) => [l.key, l.value]))
    expect(pad).toMatchObject({ Cross: 'SDL-0/A', LUp: 'SDL-0/-LeftY', R2: 'SDL-0/+RightTrigger' })
    expect(pad).not.toHaveProperty('Analog') // PS button stays the launcher's
    expect(once).toContain('SDLControllerEnhancedMode = true')
    expect(iniValues(once, 'Hotkeys').filter((l) => l.key === 'SaveStateToSlot')).toHaveLength(2)
    expect(applyPcsx2Settings(once)).toBe(once)
  })

  it('keeps a port 1 mapping made by hand', () => {
    const mine = existing.replace('Type = DualShock2', 'Type = DualShock2\nCross = SDL-0/B')
    const out = applyPcsx2Settings(mine)
    expect(iniValues(out, 'Pad1').map((l) => `${l.key}=${l.value}`)).toEqual(['Type=DualShock2', 'Cross=SDL-0/B'])
  })
})
