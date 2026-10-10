import { parseReport, SONY_VENDOR_ID, type PadState } from './dualsense'

/** Minimal WebHID typings (not in TS's DOM lib). */
interface HIDDevice extends EventTarget {
  opened: boolean
  vendorId: number
  productId: number
  productName: string
  collections: { usagePage: number; usage: number }[]
  open(): Promise<void>
}
interface HIDInputReportEvent extends Event {
  device: HIDDevice
  reportId: number
  data: DataView
}
interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>
}

export interface HidPad {
  id: string
  state: PadState
  /** performance.now() of the last parsed report; 0 = none yet. */
  lastReportAt: number
}

/** A pad that reported this recently is trusted over the Gamepad API. */
const LIVE_MS = 5000
/** Catch pads whose `connect` event never arrives (seen with Bluetooth reconnects). */
const RESCAN_MS = 3000

const pads = new Map<HIDDevice, HidPad>()

/** Generic Desktop / Gamepad — skips the pad's other interfaces (audio, etc.). */
const isGamepad = (d: HIDDevice) =>
  d.vendorId === SONY_VENDOR_ID && d.collections.some((c) => c.usagePage === 0x01 && c.usage === 0x05)

async function attach(d: HIDDevice): Promise<void> {
  if (!isGamepad(d) || pads.has(d)) return
  const id = `${d.productName || 'Sony controller'} (HID ${d.vendorId.toString(16)}:${d.productId.toString(16)})`
  const pad: HidPad = { id, state: { buttons: [], axes: [0, 0, 0, 0] }, lastReportAt: 0 }
  pads.set(d, pad)
  try {
    if (!d.opened) await d.open()
  } catch (err) {
    pads.delete(d)
    console.warn('HID open failed', id, err)
    return
  }
  d.addEventListener('inputreport', (e) => {
    const { reportId, data } = e as HIDInputReportEvent
    const s = parseReport(reportId, data)
    if (s) {
      pad.state = s
      pad.lastReportAt = performance.now()
    }
  })
}

/**
 * Reads Sony pads straight from HID. The main process grants Sony devices up front, so no picker
 * is needed. Preferred over the Gamepad API while reports keep arriving (see gamepad.ts).
 */
export function startHidPads(): () => void {
  const hid = (navigator as Navigator & { hid?: HID }).hid
  if (!hid) return () => {}
  const onConnect = (e: Event) => attach((e as Event & { device: HIDDevice }).device)
  const onDisconnect = (e: Event) => pads.delete((e as Event & { device: HIDDevice }).device)
  const scan = () => hid.getDevices().then((ds) => ds.forEach(attach))
  scan()
  const rescan = setInterval(scan, RESCAN_MS)
  hid.addEventListener('connect', onConnect)
  hid.addEventListener('disconnect', onDisconnect)
  return () => {
    clearInterval(rescan)
    hid.removeEventListener('connect', onConnect)
    hid.removeEventListener('disconnect', onDisconnect)
  }
}

export function hidPads(): HidPad[] {
  return [...pads.values()]
}

/** HID pads currently sending reports. */
export function liveHidPads(): HidPad[] {
  const now = performance.now()
  return hidPads().filter((p) => p.lastReportAt > 0 && now - p.lastReportAt < LIVE_MS)
}
