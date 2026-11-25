import { NEUTRAL_XUSB, sameXusb, toXusb, type XusbReport } from '@shared/xusb'
import { onHidReport } from './hidPads'

/**
 * Feeds the virtual Xbox pad (ADR 0018) while the main process has one plugged: each DualSense report,
 * mapped to XUSB, sent only when it changed. With the launcher in front (PS menu) the pad goes neutral,
 * so navigating the menu doesn't also play the game.
 */
export function startVirtualPadFeed(): () => void {
  let active = false
  let last: XusbReport | null = null
  const offActive = window.api.onVirtualPad((a) => {
    active = a
    last = null
  })
  const offReport = onHidReport((pad) => {
    if (!active) return
    const report = document.hasFocus() ? NEUTRAL_XUSB : toXusb(pad.state)
    if (last && sameXusb(last, report)) return
    last = report
    window.api.sendPadReport(report)
  })
  return () => {
    offActive()
    offReport()
  }
}
