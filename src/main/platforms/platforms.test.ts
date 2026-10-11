import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseEpicItem } from './epic'
import { libraryPaths, parseAppManifest } from './steam'
import { parseVdf } from './vdf'

describe('parseVdf', () => {
  it('parses nested blocks, escapes and lowercases keys', () => {
    const v = parseVdf(`"Root"\n{\n  // comment\n  "Path"  "D:\\\\Steam Library"\n  "child" { "a" "1" }\n}`)
    expect(v).toEqual({ root: { path: 'D:\\Steam Library', child: { a: '1' } } })
  })
})

describe('steam', () => {
  it('lists every library folder (new and old formats)', () => {
    const vdf = `"libraryfolders" { "0" { "path" "C:\\\\Steam" } "1" { "path" "D:\\\\SteamLibrary" } "2" "E:\\\\Old" }`
    expect(libraryPaths('C:\\Steam', vdf)).toEqual(['C:\\Steam', 'D:\\SteamLibrary', 'E:\\Old'])
  })

  it('reads installed games and skips runtimes / partial installs', () => {
    const acf = (id: string, name: string, flags = '4') =>
      `"AppState" { "appid" "${id}" "name" "${name}" "StateFlags" "${flags}" "installdir" "${name}" }`
    expect(parseAppManifest(acf('292030', 'The Witcher 3'), 'D:\\Lib')).toEqual({
      externalId: '292030',
      title: 'The Witcher 3',
      folder: join('D:\\Lib', 'steamapps', 'common', 'The Witcher 3'),
      exePath: null,
      launchUri: 'steam://rungameid/292030'
    })
    expect(parseAppManifest(acf('228980', 'Steamworks Common Redistributables'), 'D:\\Lib')).toBeNull()
    expect(parseAppManifest(acf('1', 'Updating', '1026'), 'D:\\Lib')).toBeNull()
  })
})

describe('epic', () => {
  const item = (extra: object = {}) =>
    JSON.stringify({
      DisplayName: 'Alan Wake 2',
      InstallLocation: 'C:\\Epic\\AlanWake2',
      LaunchExecutable: 'AlanWake2.exe',
      AppName: 'Dill',
      MainGameAppName: 'Dill',
      CatalogNamespace: 'ns',
      CatalogItemId: 'item',
      AppCategories: ['public', 'games', 'applications'],
      ...extra
    })

  it('reads base games with a launch URI', () => {
    expect(parseEpicItem(item())).toMatchObject({
      externalId: 'ns:item:Dill',
      title: 'Alan Wake 2',
      folder: 'C:\\Epic\\AlanWake2',
      launchUri: 'com.epicgames.launcher://apps/ns%3Aitem%3ADill?action=launch&silent=true'
    })
  })

  it('skips DLC, non-games and incomplete installs', () => {
    expect(parseEpicItem(item({ AppName: 'DillDLC' }))).toBeNull()
    expect(parseEpicItem(item({ AppCategories: ['addons'] }))).toBeNull()
    expect(parseEpicItem(item({ bIsIncompleteInstall: true }))).toBeNull()
  })
})
