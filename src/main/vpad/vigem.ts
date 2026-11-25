import type { KoffiFunction } from 'koffi'
import type { XusbReport } from '@shared/xusb'

/**
 * A virtual Xbox 360 pad through the ViGEmBus driver (the one DS4Windows uses), spoken to directly with
 * DeviceIoControl instead of the ViGEmClient C library, so there's nothing to compile (ADR 0018).
 * Layouts and codes follow ViGEmClient's include/ViGEm/km/BusShared.h and Common.h. The bus removes a
 * handle's pads when the handle closes, so a crashed launcher leaves no pad behind.
 */

/** GUID_DEVINTERFACE_BUSENUM_VIGEM {96E42B22-F5E9-42F8-B043-ED0F932F014F}. */
const VIGEM_GUID = {
  Data1: 0x96e42b22,
  Data2: 0xf5e9,
  Data3: 0x42f8,
  Data4: [0xb0, 0x43, 0xed, 0x0f, 0x93, 0x2f, 0x01, 0x4f]
}

/** CTL_CODE(FILE_DEVICE_BUS_EXTENDER, fn, METHOD_BUFFERED, FILE_WRITE_DATA). */
export const ctlCode = (fn: number): number => ((0x2a << 16) | (0x2 << 14) | (fn << 2)) >>> 0

export const IOCTL = {
  plugin: ctlCode(0x801),
  unplug: ctlCode(0x802),
  checkVersion: ctlCode(0x803),
  waitReady: ctlCode(0x804),
  xusbSubmit: ctlCode(0xa02)
}

/** VIGEM_COMMON_VERSION: the bus refuses clients built for another one. */
const COMMON_VERSION = 0x0001
/** VIGEM_TARGETS_MAX: serials are slots, the client takes the first free one. */
const MAX_SERIAL = 16
/** Microsoft's own Xbox 360 wired ids, what ViGEmClient reports by default. */
const XBOX360_VID = 0x045e
const XBOX360_PID = 0x028e

/** VIGEM_PLUGIN_TARGET: Size, SerialNo, TargetType (0 = Xbox360Wired), VendorId, ProductId. */
export function packPlugin(serial: number): Buffer {
  const b = Buffer.alloc(16)
  b.writeUInt32LE(16, 0)
  b.writeUInt32LE(serial, 4)
  b.writeUInt32LE(0, 8)
  b.writeUInt16LE(XBOX360_VID, 12)
  b.writeUInt16LE(XBOX360_PID, 14)
  return b
}

/** { ULONG Size; ULONG value } — VIGEM_UNPLUG_TARGET, VIGEM_WAIT_DEVICE_READY, VIGEM_CHECK_VERSION. */
export function packSizeAnd(value: number): Buffer {
  const b = Buffer.alloc(8)
  b.writeUInt32LE(8, 0)
  b.writeUInt32LE(value, 4)
  return b
}

const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : 0)

/** XUSB_SUBMIT_REPORT: Size, SerialNo, then XUSB_REPORT (same layout as XINPUT_GAMEPAD). */
export function packXusb(serial: number, r: XusbReport): Buffer {
  const b = Buffer.alloc(20)
  b.writeUInt32LE(20, 0)
  b.writeUInt32LE(serial, 4)
  b.writeUInt16LE(clamp(r.buttons, 0, 0xffff), 8)
  b.writeUInt8(clamp(r.leftTrigger, 0, 255), 10)
  b.writeUInt8(clamp(r.rightTrigger, 0, 255), 11)
  b.writeInt16LE(clamp(r.lx, -32768, 32767), 12)
  b.writeInt16LE(clamp(r.ly, -32768, 32767), 14)
  b.writeInt16LE(clamp(r.rx, -32768, 32767), 16)
  b.writeInt16LE(clamp(r.ry, -32768, 32767), 18)
  return b
}

/** CM_Get_Device_Interface_List's REG_MULTI_SZ (UTF-16, NUL-separated, double-NUL-terminated). */
export function parseMultiSz(buf: Buffer): string[] {
  return buf
    .toString('utf16le')
    .split('\0')
    .filter((s) => s.length > 0)
}

interface Win32 {
  listSize: KoffiFunction
  list: KoffiFunction
  createFile: KoffiFunction
  ioctl: KoffiFunction
  closeHandle: KoffiFunction
}

let win32: Win32 | null = null
let loading: Promise<Win32> | null = null

/** Loaded on first use: a broken native module only disables the virtual pad, not the launcher. */
function api(): Promise<Win32> {
  loading ??= load().catch((err) => {
    loading = null
    throw err
  })
  return loading
}

async function load(): Promise<Win32> {
  const koffi = (await import('koffi')).default
  koffi.struct('VIGEM_GUID', { Data1: 'uint32', Data2: 'uint16', Data3: 'uint16', Data4: koffi.array('uint8', 8) })
  const cfg = koffi.load('cfgmgr32.dll')
  const k32 = koffi.load('kernel32.dll')
  win32 = {
    listSize: cfg.func(
      'uint32 __stdcall CM_Get_Device_Interface_List_SizeW(_Out_ uint32 *len, VIGEM_GUID *guid, const char16_t *device, uint32 flags)'
    ),
    list: cfg.func(
      'uint32 __stdcall CM_Get_Device_Interface_ListW(VIGEM_GUID *guid, const char16_t *device, void *buf, uint32 len, uint32 flags)'
    ),
    createFile: k32.func(
      'intptr_t __stdcall CreateFileW(const char16_t *name, uint32 access, uint32 share, void *sa, uint32 disposition, uint32 flags, void *template)'
    ),
    ioctl: k32.func(
      'int __stdcall DeviceIoControl(intptr_t h, uint32 code, void *inBuf, uint32 inLen, void *outBuf, uint32 outLen, _Out_ uint32 *returned, void *overlapped)'
    ),
    closeHandle: k32.func('int __stdcall CloseHandle(intptr_t h)')
  }
  return win32
}

const GENERIC_RW = 0xc0000000
const FILE_SHARE_RW = 0x3
const OPEN_EXISTING = 3
const FILE_ATTRIBUTE_NORMAL = 0x80
const INVALID_HANDLE = -1

/** Device paths of the installed ViGEmBus (empty = not installed). */
function busPaths(w: Win32): string[] {
  const len = [0]
  if (w.listSize(len, VIGEM_GUID, null, 0) !== 0 || len[0] <= 1) return []
  const buf = Buffer.alloc(len[0] * 2)
  if (w.list(VIGEM_GUID, null, buf, len[0], 0) !== 0) return []
  return parseMultiSz(buf)
}

/** One virtual Xbox 360 pad. Windows only; elsewhere every call is a no-op so dev on the Mac runs. */
export class Xbox360Pad {
  private handle: number | null = null
  private serial: number | null = null

  get connected(): boolean {
    return this.serial != null
  }

  async plug(): Promise<void> {
    if (process.platform !== 'win32' || this.serial != null) return
    const w = await api()
    const h = this.open(w)
    for (let serial = 1; serial <= MAX_SERIAL; serial++) {
      // Async (a worker thread): plugging waits on Plug and Play and must not freeze the UI.
      if (!(await ioctlAsync(w, h, IOCTL.plugin, packPlugin(serial)))) continue
      // Pending until the pad takes reports; buses older than 1.17 don't know it and fail at once.
      await ioctlAsync(w, h, IOCTL.waitReady, packSizeAnd(serial))
      this.serial = serial
      return
    }
    this.close()
    throw new Error('O ViGEmBus não tem vaga para outro controle virtual')
  }

  /** Called per input report: synchronous, the bus answers in microseconds. */
  submit(report: XusbReport): void {
    if (this.handle == null || this.serial == null || !win32) return
    win32.ioctl(this.handle, IOCTL.xusbSubmit, packXusb(this.serial, report), 20, null, 0, [0], null)
  }

  /** Unplugs and closes the bus handle. */
  close(): void {
    if (this.handle == null || !win32) return
    if (this.serial != null) win32.ioctl(this.handle, IOCTL.unplug, packSizeAnd(this.serial), 8, null, 0, [0], null)
    win32.closeHandle(this.handle)
    this.handle = null
    this.serial = null
  }

  private open(w: Win32): number {
    if (this.handle != null) return this.handle
    const [path] = busPaths(w)
    if (!path) throw new Error('Instale o ViGEmBus para emular o controle de Xbox (veja o README)')
    const h = Number(w.createFile(path, GENERIC_RW, FILE_SHARE_RW, null, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, null))
    if (h === INVALID_HANDLE || h === 0) throw new Error('Sem acesso ao ViGEmBus')
    if (!w.ioctl(h, IOCTL.checkVersion, packSizeAnd(COMMON_VERSION), 8, null, 0, [0], null)) {
      w.closeHandle(h)
      throw new Error('Versão do ViGEmBus incompatível: atualize o driver')
    }
    this.handle = h
    return h
  }
}

function ioctlAsync(w: Win32, h: number, code: number, input: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    w.ioctl.async(h, code, input, input.length, null, 0, [0], null, (err: unknown, ok: number) => resolve(!err && !!ok))
  })
}
