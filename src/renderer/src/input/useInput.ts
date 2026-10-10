import { useEffect, useRef } from 'react'
import { inputBus, type Action } from './actions'

/** Subscribes the component to input while `active`; newest active subscriber wins. */
export function useInput(handler: (a: Action) => void, active = true): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    return inputBus.push((a) => ref.current(a))
  }, [active])
}
