import { execFile } from 'child_process'

/**
 * Waits (up to ~10 s) for the process's main window and brings it to the foreground.
 *
 * The launcher steps aside as soon as a game starts, so by the time the game's window exists the
 * launcher is no longer the foreground app and Windows' focus-stealing prevention leaves the new window
 * behind, unfocused (RetroArch then sits paused until clicked). A synthetic Alt press is the usual way to
 * be allowed to call SetForegroundWindow from a background process.
 */
export function focusWindowOf(pid: number): void {
  if (process.platform !== 'win32' || !pid) return
  const script = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class GlWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
for ($i = 0; $i -lt 40; $i++) {
  $p = Get-Process -Id ${Math.trunc(pid)} -ErrorAction SilentlyContinue
  if (-not $p) { break }
  if ($p.MainWindowHandle -ne 0) {
    Start-Sleep -Milliseconds 300
    [GlWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
    [GlWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [GlWin]::ShowWindow($p.MainWindowHandle, 5) | Out-Null
    [GlWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    break
  }
  Start-Sleep -Milliseconds 250
}`
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, () => {})
}
