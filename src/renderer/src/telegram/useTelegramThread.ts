import { useCallback, useEffect, useRef, useState } from 'react'
import type { Game, Settings, TgSystem, TgThread } from '@shared/types'

export type TgState =
  { status: 'off' } | { status: 'sending' } | { status: 'error'; error: string } | { status: 'ready'; thread: TgThread }

/** Configured chats; a null one isn't set up (or Telegram isn't signed in). */
export interface TgPeers {
  pc: string | null
  ps2: string | null
}

export function telegramPeers(s: Settings | null): TgPeers {
  const on = !!s?.telegramLoggedIn
  return { pc: (on && s?.telegramPeer) || null, ps2: (on && s?.telegramPs2Peer) || null }
}

/** Which chat a library game is asked in: PC games the PC one, PS2 ROMs/wishlist the PS2 one, others none. */
export function telegramSystemOf(game: Pick<Game, 'platform'>): TgSystem | null {
  if (!game.platform) return 'pc'
  return game.platform === 'ps2' ? 'ps2' : null
}

/** "@bot" for usernames; a display name (with spaces) as is. */
export const peerLabel = (peer: string | null) => (!peer ? '?' : /\s/.test(peer) ? peer : `@${peer}`)

/** Sends the title to the Telegram peer while `enabled` and follows the replies as they arrive. */
export function useTelegramThread(
  title: string,
  enabled: boolean,
  igdbId: number | null = null,
  system: TgSystem = 'pc'
) {
  const [state, setState] = useState<TgState>({ status: enabled ? 'sending' : 'off' })
  const query = useRef<string | null>(null)

  const send = useCallback(
    async (force: boolean) => {
      setState({ status: 'sending' })
      const res = await window.api.telegramQuery(title, force, igdbId, system)
      if (!res.ok) return setState({ status: 'error', error: res.error })
      query.current = res.value.query
      setState({ status: 'ready', thread: res.value })
    },
    [title, igdbId, system]
  )

  useEffect(() => {
    if (enabled) send(false)
    else setState({ status: 'off' })
  }, [enabled, send])

  useEffect(
    () =>
      window.api.onTelegramThread((t) => {
        if (t.query === query.current && t.system === system) setState({ status: 'ready', thread: t })
      }),
    [system]
  )

  return { state, resend: () => send(true) }
}

export function telegramMenuLabel(state: TgState): string {
  if (state.status === 'sending') return 'Telegram…'
  if (state.status === 'error') return 'Telegram · erro'
  if (state.status === 'ready') {
    const msgs = state.thread.messages
    if (msgs.length === 0) return 'Telegram · aguardando'
    const results = msgs.reduce((n, m) => n + m.commands.length, 0)
    // Bots that don't list /download results: count replies instead.
    if (results === 0 && !msgs.some((m) => m.noResults)) return `Telegram · ${msgs.length}`
    return `Telegram · ${results}`
  }
  return 'Telegram'
}
