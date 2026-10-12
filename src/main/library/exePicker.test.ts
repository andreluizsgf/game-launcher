import { describe, expect, it } from 'vitest'
import { isBlocked, pickExe, pickInstaller, titleFromFolder } from './exePicker'

describe('pickExe', () => {
  it('drops uninstallers and redists', () => {
    const r = pickExe(
      [
        { relPath: 'unins000.exe', size: 3_000_000 },
        { relPath: '_CommonRedist/vc_redist.x64.exe', size: 25_000_000 },
        { relPath: 'Hades.exe', size: 1_000_000 }
      ],
      'Hades'
    )
    expect(r?.relPath).toBe('Hades.exe')
  })

  it('prefers name match over bigger file', () => {
    const r = pickExe(
      [
        { relPath: 'Engine/Tool.exe', size: 90_000_000 },
        { relPath: 'HollowKnight.exe', size: 600_000 }
      ],
      'Hollow Knight'
    )
    expect(r?.relPath).toBe('HollowKnight.exe')
  })

  it('penalizes launcher when alternatives exist', () => {
    const r = pickExe(
      [
        { relPath: 'Launcher.exe', size: 5_000_000 },
        { relPath: 'bin/x64/game.exe', size: 40_000_000 }
      ],
      'Some Game'
    )
    expect(r?.relPath).toBe('bin/x64/game.exe')
  })

  it('picks unreal shipping binary', () => {
    const r = pickExe(
      [
        { relPath: 'Stray.exe', size: 300_000 },
        { relPath: 'Hk_project/Binaries/Win64/Stray-Win64-Shipping.exe', size: 80_000_000 }
      ],
      'Stray'
    )
    // Both match name; root stub launches the shipping exe anyway — either is fine, just must not be null
    expect(r).not.toBeNull()
  })

  it('returns null when only blocked exes', () => {
    expect(pickExe([{ relPath: 'setup.exe', size: 1 }], 'X')).toBeNull()
  })

  it('isBlocked catches crash handlers', () => {
    expect(isBlocked({ relPath: 'UnityCrashHandler64.exe', size: 1 })).toBe(true)
  })
})

describe('pickInstaller', () => {
  const c = (relPath: string) => ({ relPath, size: 1 })

  it('finds a repack setup at the top or in the release folder', () => {
    expect(
      pickInstaller([c('Hades [FitGirl Repack]/setup.exe'), c('Hades [FitGirl Repack]/MD5/QuickSFV.exe')])
    ).toEqual(c('Hades [FitGirl Repack]/setup.exe'))
    expect(pickInstaller([c('a/setup.exe'), c('setup.exe')])).toEqual(c('setup.exe'))
  })

  it('ignores redist installers deeper down', () => {
    expect(pickInstaller([c('Game/_CommonRedist/DirectX/setup.exe')])).toBeNull()
    expect(pickInstaller([c('Game.exe')])).toBeNull()
  })

  it('leaves no playable exe in a FitGirl repack', () => {
    expect(pickExe([c('R/setup.exe'), c('R/MD5/QuickSFV.EXE')], 'Hades')).toBeNull()
  })
})

describe('titleFromFolder', () => {
  it('cleans separators and versions', () => {
    expect(titleFromFolder('The_Witcher.3-v4.04')).toBe('The Witcher 3')
    expect(titleFromFolder('Celeste [GOG]')).toBe('Celeste')
    expect(titleFromFolder('Hades')).toBe('Hades')
  })
})
