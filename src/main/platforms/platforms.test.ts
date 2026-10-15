import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseCatCache, parseEpicItem } from './epic'
import { libraryToGames } from './epicAccount'
import { libraryPaths, parseAppManifest, parseOwnedGames, steamIdFromLoginUsers } from './steam'
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

describe('steam account', () => {
  it('picks the most recent login', () => {
    const vdf = `"users" {
      "76561190000000001" { "AccountName" "a" "MostRecent" "0" }
      "76561190000000002" { "AccountName" "b" "MostRecent" "1" }
    }`
    expect(steamIdFromLoginUsers(vdf)).toBe('76561190000000002')
    expect(steamIdFromLoginUsers('"users" {}')).toBeNull()
  })

  it('turns owned games into install links, dropping runtimes', () => {
    const games = parseOwnedGames({
      response: {
        games: [
          { appid: 620, name: 'Portal 2' },
          { appid: 228980, name: 'Steamworks Common Redistributables' }
        ]
      }
    })
    expect(games).toEqual([
      { externalId: '620', title: 'Portal 2', folder: null, exePath: null, launchUri: 'steam://install/620' }
    ])
  })
})

describe('epic catalog cache', () => {
  const items = [
    {
      id: 'item1',
      namespace: 'ns1',
      title: 'Control',
      categories: [{ path: 'games' }, { path: 'applications' }],
      keyImages: [
        { type: 'DieselGameBoxTall', url: 'https://cdn/tall.jpg' },
        { type: 'DieselGameBox', url: 'https://cdn/wide.jpg' }
      ],
      releaseInfo: [{ appId: 'Calluna', platform: ['Windows'] }]
    },
    {
      id: 'dlc1',
      namespace: 'ns1',
      title: 'Control - AWE',
      categories: [{ path: 'addons' }],
      releaseInfo: [{ appId: 'CallunaAwe' }],
      mainGameItem: { id: 'item1' }
    },
    {
      id: 'mac',
      namespace: 'ns2',
      title: 'Mac only',
      categories: [{ path: 'games' }],
      releaseInfo: [{ appId: 'M', platform: ['Mac'] }]
    }
  ]

  it('lists base games with their art from the base64 cache', () => {
    const games = parseCatCache(Buffer.from(JSON.stringify(items)).toString('base64'))
    expect(games).toEqual([
      {
        externalId: 'ns1:item1:Calluna',
        title: 'Control',
        folder: null,
        exePath: null,
        launchUri: 'com.epicgames.launcher://apps/ns1%3Aitem1%3ACalluna?action=install',
        art: { cover: 'https://cdn/tall.jpg', wide: 'https://cdn/wide.jpg' }
      }
    ])
  })

  it('survives garbage', () => {
    expect(parseCatCache('not base64 json')).toEqual([])
  })
})

describe('epic account library', () => {
  const catalog = {
    item1: {
      title: 'Control',
      categories: [{ path: 'games/edition/base' }, { path: 'games' }],
      keyImages: [{ type: 'DieselGameBoxTall', url: 'https://cdn/tall.jpg' }]
    },
    dlc1: { title: 'Control - AWE', categories: [{ path: 'addons' }], mainGameItem: { id: 'item1' } }
  }

  it('maps owned records to games, skipping DLC, Unreal assets and unknown items', () => {
    const games = libraryToGames(
      [
        { namespace: 'ns1', catalogItemId: 'item1', appName: 'Calluna' },
        { namespace: 'ns1', catalogItemId: 'dlc1', appName: 'CallunaAwe' },
        { namespace: 'ue', catalogItemId: 'item1', appName: 'Asset' },
        { namespace: 'ns9', catalogItemId: 'unknown', appName: 'X' }
      ],
      catalog
    )
    expect(games).toEqual([
      {
        externalId: 'ns1:item1:Calluna',
        title: 'Control',
        folder: null,
        exePath: null,
        launchUri: 'com.epicgames.launcher://apps/ns1%3Aitem1%3ACalluna?action=install',
        art: { cover: 'https://cdn/tall.jpg', wide: null }
      }
    ])
  })
})
