/** Emulators the launcher knows how to drive. */
export type EmulatorId = 'retroarch' | 'pcsx2' | 'rpcs3'

export const EMULATOR_NAME: Record<EmulatorId, string> = {
  retroarch: 'RetroArch',
  pcsx2: 'PCSX2',
  rpcs3: 'RPCS3'
}

export interface GameSystem {
  id: string
  name: string
  /** Folder names (normalized: lowercase letters and digits) that mean this system under the ROMs folder. */
  folders: string[]
  emulator: EmulatorId
  /** RetroArch cores, best first; the first one installed is used. */
  cores?: string[]
  /** ROM file extensions, lowercase, no dot. */
  exts: string[]
  /** IGDB platform id, to search the right console's catalog. */
  igdbPlatform: number
}

const CART = ['zip', '7z']

export const SYSTEMS: GameSystem[] = [
  { id: 'ps3', name: 'PlayStation 3', folders: ['ps3', 'playstation3'], emulator: 'rpcs3', exts: ['iso'], igdbPlatform: 9 },
  {
    id: 'ps2',
    name: 'PlayStation 2',
    folders: ['ps2', 'playstation2'],
    emulator: 'pcsx2',
    exts: ['iso', 'chd', 'cso', 'zso', 'gz', 'cue', 'bin'],
    igdbPlatform: 8
  },
  {
    id: 'psx',
    name: 'PlayStation',
    folders: ['psx', 'ps1', 'playstation', 'playstation1'],
    emulator: 'retroarch',
    cores: ['swanstation', 'mednafen_psx_hw', 'pcsx_rearmed'],
    exts: ['m3u', 'chd', 'cue', 'pbp', 'bin', 'iso'],
    igdbPlatform: 7
  },
  {
    id: 'psp',
    name: 'PSP',
    folders: ['psp'],
    emulator: 'retroarch',
    cores: ['ppsspp'],
    exts: ['iso', 'cso', 'pbp', 'chd'],
    igdbPlatform: 38
  },
  {
    id: 'nes',
    name: 'NES',
    folders: ['nes', 'famicom', 'nintendo'],
    emulator: 'retroarch',
    cores: ['mesen', 'fceumm', 'nestopia'],
    exts: ['nes', 'fds', ...CART],
    igdbPlatform: 18
  },
  {
    id: 'snes',
    name: 'Super Nintendo',
    folders: ['snes', 'supernintendo', 'superfamicom', 'sfc'],
    emulator: 'retroarch',
    cores: ['snes9x', 'bsnes'],
    exts: ['sfc', 'smc', ...CART],
    igdbPlatform: 19
  },
  {
    id: 'n64',
    name: 'Nintendo 64',
    folders: ['n64', 'nintendo64'],
    emulator: 'retroarch',
    cores: ['mupen64plus_next', 'parallel_n64'],
    exts: ['n64', 'z64', 'v64', ...CART],
    igdbPlatform: 4
  },
  {
    id: 'gb',
    name: 'Game Boy',
    folders: ['gb', 'gameboy'],
    emulator: 'retroarch',
    cores: ['gambatte', 'mgba'],
    exts: ['gb', ...CART],
    igdbPlatform: 33
  },
  {
    id: 'gbc',
    name: 'Game Boy Color',
    folders: ['gbc', 'gameboycolor'],
    emulator: 'retroarch',
    cores: ['gambatte', 'mgba'],
    exts: ['gbc', ...CART],
    igdbPlatform: 22
  },
  {
    id: 'gba',
    name: 'Game Boy Advance',
    folders: ['gba', 'gameboyadvance'],
    emulator: 'retroarch',
    cores: ['mgba', 'vba_next'],
    exts: ['gba', ...CART],
    igdbPlatform: 24
  },
  {
    id: 'nds',
    name: 'Nintendo DS',
    folders: ['nds', 'ds', 'nintendods'],
    emulator: 'retroarch',
    cores: ['melondsds', 'melonds', 'desmume'],
    exts: ['nds', ...CART],
    igdbPlatform: 20
  },
  {
    id: 'megadrive',
    name: 'Mega Drive',
    folders: ['megadrive', 'genesis', 'md'],
    emulator: 'retroarch',
    cores: ['genesis_plus_gx', 'picodrive'],
    exts: ['md', 'gen', 'smd', 'bin', ...CART],
    igdbPlatform: 29
  },
  {
    id: 'mastersystem',
    name: 'Master System',
    folders: ['mastersystem', 'sms'],
    emulator: 'retroarch',
    cores: ['genesis_plus_gx', 'picodrive'],
    exts: ['sms', ...CART],
    igdbPlatform: 64
  },
  {
    id: 'gamegear',
    name: 'Game Gear',
    folders: ['gamegear', 'gg'],
    emulator: 'retroarch',
    cores: ['genesis_plus_gx'],
    exts: ['gg', ...CART],
    igdbPlatform: 35
  },
  {
    id: 'dreamcast',
    name: 'Dreamcast',
    folders: ['dreamcast', 'dc'],
    emulator: 'retroarch',
    cores: ['flycast'],
    exts: ['m3u', 'chd', 'gdi', 'cdi'],
    igdbPlatform: 23
  },
  {
    id: 'pcengine',
    name: 'PC Engine',
    folders: ['pcengine', 'turbografx16', 'turbografx', 'tg16'],
    emulator: 'retroarch',
    cores: ['mednafen_pce_fast', 'mednafen_pce'],
    exts: ['pce', 'chd', 'cue', ...CART],
    igdbPlatform: 86
  },
  {
    id: 'arcade',
    name: 'Arcade',
    folders: ['arcade', 'fbneo', 'mame', 'fba'],
    emulator: 'retroarch',
    cores: ['fbneo', 'mame2003_plus'],
    exts: ['zip', '7z'],
    igdbPlatform: 52
  }
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** "Super Nintendo", "snes", "Mega-Drive"… → the system, by its folder name. */
export function systemForFolder(name: string): GameSystem | null {
  const n = norm(name)
  return SYSTEMS.find((s) => s.folders.includes(n)) ?? null
}

export const systemById = (id: string | null | undefined): GameSystem | null =>
  SYSTEMS.find((s) => s.id === id) ?? null
