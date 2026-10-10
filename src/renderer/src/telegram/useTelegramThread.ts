import { useCallback, useEffect, useRef, useState } from 'react'
import type { TgThread } from '@shared/types'

export type TgState =
  | { status: 'off' }
  | { status: 'sending' }
  | { status: 'error'; error: string }
  | { status: 'ready'; thread: TgThread }

/** Sends the title to the Telegram peer while `enabled` and follows the replies as they arrive. */
export function useTelegramThread(title: string, enabled: boolean) {
  const [state, setState] = useState<TgState>({ status: enabled ? 'sending' : 'off' })
  const query = useRef<string | null>(null)

  const send = useCallback(
    async (force: boolean) => {
      setState({ status: 'sending' })
      const res = await window.api.telegramQuery(title, force)
      if (!res.ok) return setState({ status: 'error', error: res.error })
      query.current = res.value.query
      setState({ status: 'ready', thread: res.value })
    },
    [title]
  )

  useEffect(() => {
    if (enabled) send(false)
    else setState({ status: 'off' })
  }, [enabled, send])

  useEffect(
    () =>
      window.api.onTelegramThread((t) => {
        if (t.query === query.current) setState({ status: 'ready', thread: t })
      }),
    []
  )

  return { state, resend: () => send(true) }
}

export function telegramMenuLabel(state: TgState): string {
  if (state.status === 'sending') return 'Telegram…'
  if (state.status === 'error') return 'Telegram · erro'
  if (state.status === 'ready') return `Telegram · ${state.thread.messages.length}`
  return 'Telegram'
}
