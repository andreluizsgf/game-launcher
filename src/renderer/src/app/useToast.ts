import { useCallback, useRef, useState } from 'react'

/** One transient message at a time; a new one replaces the current. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const notify = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 3500)
  }, [])
  return { toast, notify }
}
