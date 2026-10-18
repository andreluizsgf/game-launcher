import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { systemById, systemForFolder } from '@shared/systems'
import { launchArgs } from './launch'
import { romTitle, scanRoms } from './scan'
import { parseSfo } from './sfo'

/** Minimal PARAM.SFO with string entries. */
function sfo(entries: Record<string, string>): Buffer {
  const keys = Object.keys(entries)
  const keyTable = Buffer.from(keys.map((k) => `${k}\0`).join(''))
  const datas = keys.map((k) => Buffer.from(`${entries[k]}\0`))
  const header = Buffer.alloc(20)
  const index = Buffer.alloc(16 * keys.length)
  const keyStart = 20 + index.length
  const dataStart = keyStart + keyTable.length
  header.writeUInt32BE(0x00505346, 0)
  header.writeUInt32LE(0x101, 4)
  header.writeUInt32LE(keyStart, 8)
  header.writeUInt32LE(dataStart, 12)
  header.writeUInt32LE(keys.length, 16)
  let kOff = 0
  let dOff = 0
  keys.forEach((k, i) => {
    index.writeUInt16LE(kOff, i * 16)
    index.writeUInt16LE(0x0204, i * 16 + 2)
    index.writeUInt32LE(datas[i].length, i * 16 + 4)
    index.writeUInt32LE(datas[i].length, i * 16 + 8)
    index.writeUInt32LE(dOff, i * 16 + 12)
    kOff += k.length + 1
    dOff += datas[i].length
  })
  return Buffer.concat([header, index, keyTable, ...datas])
}

const root = mkdtempSync(join(tmpdir(), 'gl-roms-'))
const file = (p: string, content: string | Buffer = 'x') => {
  mkdirSync(join(root, p, '..'), { recursive: true })
  writeFileSync(join(root, p), content)
}
afterAll(() => rmSync(root, { recursive: true, force: true }))

file('roms/SNES/Super Mario World (USA).sfc')
file('roms/SNES/readme.txt')
file('roms/ps2/God of War (USA).iso')
file('roms/psx/Crash Bandicoot (USA)/Crash Bandicoot (USA).cue')
file('roms/psx/Crash Bandicoot (USA)/Crash Bandicoot (USA) (Track 1).bin')
file('roms/psx/FF7/Final Fantasy VII (USA).m3u', 'Final Fantasy VII (USA) (Disc 1).chd\nFinal Fantasy VII (USA) (Disc 2).chd\n')
file('roms/psx/FF7/Final Fantasy VII (USA) (Disc 1).chd')
file('roms/psx/FF7/Final Fantasy VII (USA) (Disc 2).chd')
file('roms/psx/Parasite Eve (USA) (Disc 1).chd')
file('roms/psx/Parasite Eve (USA) (Disc 2).chd')
file('roms/Mega Drive/Sonic.md')
file('roms/Mega Drive/Streets of Rage.bin')
file('roms/ps3/BLUS30001/PS3_GAME/PARAM.SFO', sfo({ TITLE: 'Demon’s Souls™', CATEGORY: 'DG' }))
file('roms/ps3/BLUS30001/PS3_GAME/USRDIR/EBOOT.BIN')
file('roms/ps3/Journey [NPUA80069]/USRDIR/EBOOT.BIN')
file('roms/ps3/Journey [NPUA80069]/PARAM.SFO', sfo({ TITLE: 'Journey', CATEGORY: 'HG' }))
file('roms/whatever/game.bin')
file('rpcs3/dev_hdd0/game/NPUB31154/PARAM.SFO', sfo({ TITLE: 'Hotline Miami', CATEGORY: 'HG' }))
file('rpcs3/dev_hdd0/game/NPUB31154/USRDIR/EBOOT.BIN')
file('rpcs3/dev_hdd0/game/BLUS30001/PARAM.SFO', sfo({ TITLE: 'Demon’s Souls', CATEGORY: 'GD' }))
file('rpcs3/dev_hdd0/game/BLUS30001/USRDIR/EBOOT.BIN')

describe('systems', () => {
  it('maps folder names to systems', () => {
    expect(systemForFolder('Mega Drive')?.id).toBe('megadrive')
    expect(systemForFolder('PS1')?.id).toBe('psx')
    expect(systemForFolder('SNES')?.id).toBe('snes')
    expect(systemForFolder('Music')).toBeNull()
  })

  it('cleans ROM names', () => {
    expect(romTitle('Final Fantasy VII (USA) (Disc 1).chd')).toBe('Final Fantasy VII')
    expect(romTitle('Super Mario World (USA).sfc')).toBe('Super Mario World')
  })

  it('reads PARAM.SFO', () => {
    expect(parseSfo(sfo({ TITLE: 'Journey', CATEGORY: 'HG' }))).toEqual({ TITLE: 'Journey', CATEGORY: 'HG' })
    expect(parseSfo(Buffer.from('nope'))).toEqual({})
  })
})

describe('scanRoms', () => {
  it('finds one game per ROM, skipping tracks, playlist discs and extra discs', async () => {
    const games = await scanRoms(join(root, 'roms'), join(root, 'rpcs3'))
    const list = games.map((g) => `${g.platform}:${g.title}`).sort()
    expect(list).toEqual([
      'megadrive:Sonic',
      'megadrive:Streets of Rage',
      'ps2:God of War',
      'ps3:Demon’s Souls',
      'ps3:Hotline Miami',
      'ps3:Journey',
      'psx:Crash Bandicoot',
      'psx:Final Fantasy VII',
      'psx:Parasite Eve',
      'snes:Super Mario World'
    ])
    const ff7 = games.find((g) => g.title === 'Final Fantasy VII')!
    expect(ff7.exePath).toMatch(/\.m3u$/)
    expect(ff7.externalId).toBe('psx:psx/ff7/final fantasy vii (usa).m3u')
    expect(games.find((g) => g.title === 'Journey')!.exePath).toMatch(/USRDIR[\\/]EBOOT\.BIN$/)
    // The patch (GD) of a disc game in dev_hdd0 isn't a game.
    expect(games.filter((g) => g.title.startsWith('Demon'))).toHaveLength(1)
  })
})

describe('launchArgs', () => {
  it('boots PS2/PS3 games without the emulator UI', () => {
    expect(launchArgs(systemById('ps2')!, 'C:/PCSX2/pcsx2-qt.exe', 'g.iso')).toEqual([
      '-batch',
      '-nogui',
      '-fullscreen',
      '--',
      'g.iso'
    ])
    expect(launchArgs(systemById('ps3')!, 'C:/RPCS3/rpcs3.exe', 'EBOOT.BIN')).toEqual([
      '--no-gui',
      '--fullscreen',
      'EBOOT.BIN'
    ])
  })

  it('picks the first installed RetroArch core, or explains which one to get', () => {
    const ra = join(root, 'RetroArch')
    file('RetroArch/cores/snes9x_libretro.dll')
    const snes = systemById('snes')!
    expect(launchArgs(snes, join(ra, 'retroarch.exe'), 'smw.sfc')).toEqual([
      '-L',
      join(ra, 'cores', 'snes9x_libretro.dll'),
      '-f',
      'smw.sfc'
    ])
    expect(launchArgs(snes, join(ra, 'retroarch.exe'), 'smw.sfc', 'C:/gl/ra.cfg')).toContain(
      '--appendconfig=C:/gl/ra.cfg'
    )
    expect(() => launchArgs(systemById('gba')!, join(ra, 'retroarch.exe'), 'x.gba')).toThrow(/mgba/)
  })
})

describe('RetroArch commands', () => {
  it('sends the command to the local network command port', async () => {
    const { createSocket } = await import('dgram')
    const { sendRetroArch } = await import('./retroarchCmd')
    const { RETROARCH_CMD_PORT, RETROARCH_OVERRIDES } = await import('./launch')
    expect(RETROARCH_OVERRIDES).toContain(`network_cmd_port = "${RETROARCH_CMD_PORT}"`)
    expect(RETROARCH_OVERRIDES).toContain('input_player1_analog_dpad_mode = "1"')
    expect(RETROARCH_OVERRIDES).toContain('input_enable_hotkey_btn = "4"')
    expect(RETROARCH_OVERRIDES).toContain('pause_nonactive = "true"')
    expect(RETROARCH_OVERRIDES).toContain('input_player1_select_btn = "20"')
    const server = createSocket('udp4')
    const got = new Promise<string>((resolve) => server.on('message', (m) => resolve(m.toString())))
    await new Promise<void>((r) => server.bind(RETROARCH_CMD_PORT, '127.0.0.1', r))
    await sendRetroArch('saveState')
    expect(await got).toBe('SAVE_STATE')
    server.close()
  })
})
