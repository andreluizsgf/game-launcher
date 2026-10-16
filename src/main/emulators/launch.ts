import { existsSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { EMULATOR_NAME, type EmulatorId, type GameSystem } from '@shared/systems'

const EXE: Record<EmulatorId, string[]> = {
  retroarch: ['retroarch.exe'],
  pcsx2: ['pcsx2-qt.exe', 'pcsx2.exe'],
  rpcs3: ['rpcs3.exe']
}

const FOLDER: Record<EmulatorId, string[]> = {
  retroarch: ['RetroArch', 'RetroArch-Win64'],
  pcsx2: ['PCSX2'],
  rpcs3: ['RPCS3']
}

/** The emulator's exe directly in `dir` or one folder down (portable builds unzip into a subfolder). */
function findIn(dir: string, id: EmulatorId): string | null {
  for (const exe of EXE[id]) if (existsSync(join(dir, exe))) return join(dir, exe)
  let subs: string[] = []
  try {
    subs = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch {
    return null
  }
  for (const s of subs) for (const exe of EXE[id]) if (existsSync(join(dir, s, exe))) return join(dir, s, exe)
  return null
}

/**
 * Usual install places, plus an "Emuladores"/"Emulators" folder next to (or inside) the ROMs folder,
 * where portable emulators tend to live.
 */
export function detectEmulator(id: EmulatorId, romsRoot: string | null): string | null {
  if (process.platform !== 'win32') return null
  const env = process.env
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.APPDATA, env.LOCALAPPDATA, 'C:\\', 'D:\\']
  const dirs = roots.filter((r): r is string => !!r).flatMap((r) => FOLDER[id].map((f) => join(r, f)))
  if (romsRoot) {
    for (const base of [romsRoot, dirname(romsRoot)]) {
      for (const name of ['Emuladores', 'Emulators', 'Emulator', 'Emulador']) dirs.push(join(base, name))
    }
  }
  for (const d of dirs) {
    const exe = findIn(d, id) ?? FOLDER[id].map((f) => findIn(join(d, f), id)).find(Boolean)
    if (exe) return exe
  }
  return null
}

/** RetroArch's network command interface (UDP, localhost only): the in-game menu drives it. */
export const RETROARCH_CMD_PORT = 55355

/**
 * RetroArch settings layered over the user's config on every launch:
 * - SDL2 pad driver: the default Windows ones (xinput/dinput) miss the DualSense, and over Bluetooth Steam
 *   switches it into a report mode dinput can't read; SDL2 handles every mode and autoconfigures it.
 * - Left stick drives the d-pad on digital-only systems (mode 1 leaves real analog games alone).
 * - Pad hotkeys, all behind Create (PS stays the launcher's): R1 save, L1 load, R2 fast-forward,
 *   ←/→ state slot, Options RetroArch's menu. Numbers are SDL GameController buttons/axes.
 * - Network commands on localhost, for the launcher's in-game menu.
 */
export const RETROARCH_OVERRIDES =
  [
    'input_joypad_driver = "sdl2"',
    'input_autodetect_enable = "true"',
    ...[1, 2, 3, 4].map((p) => `input_player${p}_analog_dpad_mode = "1"`),
    'input_enable_hotkey_btn = "4"',
    'input_save_state_btn = "10"',
    'input_load_state_btn = "9"',
    'input_toggle_fast_forward_axis = "+5"',
    'input_state_slot_increase_btn = "14"',
    'input_state_slot_decrease_btn = "13"',
    'input_menu_toggle_btn = "6"',
    'network_cmd_enable = "true"',
    `network_cmd_port = "${RETROARCH_CMD_PORT}"`
  ].join('\n') + '\n'

/**
 * Arguments that boot `rom` straight into the game, fullscreen and without the emulator's UI.
 * `retroarchConfig`: a file with RETROARCH_OVERRIDES, appended to RetroArch's own config.
 */
export function launchArgs(system: GameSystem, emulatorExe: string, rom: string, retroarchConfig?: string): string[] {
  switch (system.emulator) {
    case 'pcsx2':
      return ['-batch', '-nogui', '-fullscreen', '--', rom]
    case 'rpcs3':
      return ['--no-gui', '--fullscreen', rom]
    case 'retroarch': {
      const cores = join(dirname(emulatorExe), 'cores')
      const core = (system.cores ?? [])
        .map((c) => join(cores, `${c}_libretro.dll`))
        .find((p) => existsSync(p))
      if (!core) {
        throw new Error(
          `Falta o core de ${system.name} no RetroArch. Abra o RetroArch → Online Updater → Core Downloader e baixe "${system.cores?.[0]}".`
        )
      }
      return ['-L', core, '-f', ...(retroarchConfig ? [`--appendconfig=${retroarchConfig}`] : []), rom]
    }
  }
}

export const missingEmulator = (id: EmulatorId) =>
  new Error(`${EMULATOR_NAME[id]} não encontrado. Aponte o executável em Configurações → Emuladores.`)
