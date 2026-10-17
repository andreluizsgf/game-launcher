import { execFile } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { EmulatorAction } from '@shared/types'

// ---------- INI editing (keeps everything it doesn't touch, comments and order included) ----------

interface Line {
  section: string
  key: string | null
  value: string
  raw: string
}

function parse(text: string): Line[] {
  let section = ''
  return text.split(/\r?\n/).map((raw) => {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(raw)
    if (header) {
      section = header[1]
      return { section, key: null, value: '', raw }
    }
    const kv = /^\s*([^=;#]+?)\s*=\s*(.*?)\s*$/.exec(raw)
    return kv ? { section, key: kv[1], value: kv[2], raw } : { section, key: null, value: '', raw }
  })
}

const render = (lines: Line[]) =>
  lines
    .map((l) => l.raw)
    .join('\n')
    .replace(/\n*$/, '\n')

function insertAt(lines: Line[], section: string): number {
  let last = -1
  lines.forEach((l, i) => {
    if (l.section === section && (l.key || /^\s*\[/.test(l.raw))) last = i
  })
  if (last >= 0) return last + 1
  lines.push({ section: '', key: null, value: '', raw: '' }, { section, key: null, value: '', raw: `[${section}]` })
  return lines.length
}

/** Sets `key` to exactly `value` (replacing every existing line for it). */
export function iniSet(text: string, section: string, key: string, value: string): string {
  const lines = parse(text).filter((l) => !(l.section === section && l.key === key))
  lines.splice(insertAt(lines, section), 0, { section, key, value, raw: `${key} = ${value}` })
  return render(lines)
}

/** Adds `value` as one more binding of `key` (PCSX2 bindings can repeat), unless it's already there. */
export function iniAdd(text: string, section: string, key: string, value: string): string {
  const lines = parse(text)
  if (lines.some((l) => l.section === section && l.key === key && l.value === value)) return text
  lines.splice(insertAt(lines, section), 0, { section, key, value, raw: `${key} = ${value}` })
  return render(lines)
}

/** Removes the lines of `section` whose value matches `pred`. */
export function iniRemove(text: string, section: string, pred: (key: string, value: string) => boolean): string {
  const lines = parse(text)
  const kept = lines.filter((l) => !(l.section === section && l.key && pred(l.key, l.value)))
  return kept.length === lines.length ? text : render(kept)
}

export const iniValues = (text: string, section: string) =>
  parse(text).filter((l) => l.section === section && l.key) as Array<Line & { key: string }>

// ---------- PCSX2 settings the launcher needs ----------

/** What PCSX2's own "Automatic Mapping" writes for the first SDL pad (PS button left to the launcher). */
const PAD1: Record<string, string> = {
  Type: 'DualShock2',
  Up: 'SDL-0/DPadUp',
  Right: 'SDL-0/DPadRight',
  Down: 'SDL-0/DPadDown',
  Left: 'SDL-0/DPadLeft',
  Triangle: 'SDL-0/Y',
  Circle: 'SDL-0/B',
  Cross: 'SDL-0/A',
  Square: 'SDL-0/X',
  Select: 'SDL-0/Back',
  Start: 'SDL-0/Start',
  L1: 'SDL-0/LeftShoulder',
  L2: 'SDL-0/+LeftTrigger',
  R1: 'SDL-0/RightShoulder',
  R2: 'SDL-0/+RightTrigger',
  L3: 'SDL-0/LeftStick',
  R3: 'SDL-0/RightStick',
  LUp: 'SDL-0/-LeftY',
  LRight: 'SDL-0/+LeftX',
  LDown: 'SDL-0/+LeftY',
  LLeft: 'SDL-0/-LeftX',
  RUp: 'SDL-0/-RightY',
  RRight: 'SDL-0/+RightX',
  RDown: 'SDL-0/+RightY',
  RLeft: 'SDL-0/-RightX',
  LargeMotor: 'SDL-0/LargeMotor',
  SmallMotor: 'SDL-0/SmallMotor'
}

/**
 * Pad chords behind the touchpad click (same layout as RetroArch) plus the keys the launcher's PS menu presses.
 * The PS2 has no touchpad, so it's never a game button (Select/Create is, all the time).
 */
const MOD = 'SDL-0/Touchpad'
const HOTKEYS: Record<string, string[]> = {
  SaveStateToSlot: [`${MOD} & SDL-0/RightShoulder`, 'Keyboard/F1'],
  LoadStateFromSlot: [`${MOD} & SDL-0/LeftShoulder`, 'Keyboard/F3'],
  ToggleTurbo: [`${MOD} & SDL-0/+RightTrigger`, 'Keyboard/Pause'],
  NextSaveStateSlot: [`${MOD} & SDL-0/DPadRight`],
  PreviousSaveStateSlot: [`${MOD} & SDL-0/DPadLeft`]
}
/** Chords older versions bound behind Create (Select in PS2 games). */
const OLD_CHORD = /^SDL-0\/Back & /

/** The keys above, as SendKeys sends them. */
const ACTION_KEY: Partial<Record<EmulatorAction, string>> = {
  saveState: '{F1}',
  loadState: '{F3}',
  fastForward: '{BREAK}'
}

/**
 * Applies the launcher's input setup to a PCSX2.ini: SDL with the DualSense enhanced mode, the pad on port 1
 * (only when it isn't bound to a controller yet — a mapping made by hand is kept) and the hotkeys.
 */
export function applyPcsx2Settings(text: string): string {
  let out = iniSet(text, 'InputSources', 'SDL', 'true')
  out = iniSet(out, 'InputSources', 'SDLControllerEnhancedMode', 'true')
  const padBound = iniValues(out, 'Pad1').some((l) => l.key !== 'Type' && /^SDL-|^XInput-|^DInput-/.test(l.value))
  if (!padBound) for (const [k, v] of Object.entries(PAD1)) out = iniSet(out, 'Pad1', k, v)
  out = iniRemove(out, 'Hotkeys', (k, v) => k in HOTKEYS && OLD_CHORD.test(v))
  for (const [k, values] of Object.entries(HOTKEYS)) for (const v of values) out = iniAdd(out, 'Hotkeys', k, v)
  return out
}

/** PCSX2.ini: next to the exe in portable mode, otherwise in Documents\PCSX2 (where PCSX2 creates it). */
export function pcsx2IniPath(exe: string, documents: string): string {
  const exeDir = dirname(exe)
  const portable = ['portable.ini', 'portable.txt'].some((f) => existsSync(join(exeDir, f)))
  const candidates = portable
    ? [join(exeDir, 'inis', 'PCSX2.ini')]
    : [join(documents, 'PCSX2', 'inis', 'PCSX2.ini'), join(process.env.APPDATA ?? '', 'PCSX2', 'inis', 'PCSX2.ini')]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

/** Run before every PCSX2 launch (idempotent). */
export function preparePcsx2(exe: string, documents: string): void {
  const ini = pcsx2IniPath(exe, documents)
  let text = ''
  try {
    text = readFileSync(ini, 'utf8')
  } catch {
    mkdirSync(dirname(ini), { recursive: true })
  }
  const next = applyPcsx2Settings(text)
  if (next !== text) writeFileSync(ini, next)
}

/**
 * PS-menu actions: PCSX2 has no command interface, so its window gets focus back and the hotkey is
 * pressed (the keyboard bindings applyPcsx2Settings adds).
 */
export function pcsx2Action(exe: string, action: EmulatorAction): Promise<void> {
  const key = ACTION_KEY[action]
  if (!key) return Promise.reject(new Error('Não disponível no PCSX2'))
  if (process.platform !== 'win32') return Promise.resolve()
  const path = exe.replace(/'/g, "''")
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class GlWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
$p = Get-Process | Where-Object { $_.Path -eq '${path}' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { exit 1 }
Start-Sleep -Milliseconds 250
[GlWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
[GlWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
[GlWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('${key}')`
  return new Promise((resolve, reject) =>
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err) =>
      err ? reject(new Error('Não achei a janela do PCSX2')) : resolve()
    )
  )
}
