import { spawn } from 'child_process'

/** How often the foreground window is sampled. */
export const FOCUS_SAMPLE_MS = 1000
/**
 * Longest gap one sample may account for. Covers a busy PC delaying a sample, but not sleep: timers stop
 * while Windows is suspended and the first sample after waking must not count the whole night.
 */
const MAX_GAP_MS = 3 * FOCUS_SAMPLE_MS

/**
 * Playtime that only counts while the game is the foreground window. Each sample attributes the time since
 * the previous one to the state it saw.
 */
export class FocusClock {
  private last: number
  private playedMs = 0
  private samples = 0

  constructor(startedAt: number) {
    this.last = startedAt
  }

  sample(now: number, focused: boolean): void {
    const gap = Math.min(Math.max(now - this.last, 0), MAX_GAP_MS)
    this.last = now
    this.samples++
    if (focused) this.playedMs += gap
  }

  /** Focused time; the wall-clock fallback is for when the sampler never reported (PowerShell failed). */
  played(startedAt: number, endedAt: number): number {
    return this.samples ? this.playedMs : endedAt - startedAt
  }
}

/**
 * Prints the foreground window's executable path every FOCUS_SAMPLE_MS (empty line when there is none).
 * QueryFullProcessImageName with PROCESS_QUERY_LIMITED_INFORMATION also works on elevated games, where
 * Get-Process' Path is access denied. UTF-8 so folders like "Ação" compare right. One long-lived process:
 * Add-Type compiles once, not every sample.
 */
const FOREGROUND_SCRIPT = `
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class GlFg {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool i, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  static extern bool QueryFullProcessImageName(IntPtr h, uint f, StringBuilder s, ref uint n);
  public static string Path() {
    uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    if (pid == 0) return "";
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return "";
    var sb = new StringBuilder(1024); uint n = 1024;
    string r = QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : "";
    CloseHandle(h); return r;
  }
}
"@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
while ($true) {
  [Console]::Out.WriteLine([GlFg]::Path()); [Console]::Out.Flush()
  Start-Sleep -Milliseconds ${FOCUS_SAMPLE_MS}
}`

/** Starts sampling the foreground window (Windows only); call the returned function to stop. */
export function watchForeground(onSample: (exePath: string) => void): () => void {
  if (process.platform !== 'win32') return () => {}
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', FOREGROUND_SCRIPT], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  ps.on('error', (e) => console.error('[focus] sampler failed', e))
  let buf = ''
  ps.stdout.setEncoding('utf8')
  ps.stdout.on('data', (chunk: string) => {
    buf += chunk
    const lines = buf.split(/\r?\n/)
    buf = lines.pop()!
    for (const l of lines) onSample(l.trim())
  })
  return () => ps.kill()
}
