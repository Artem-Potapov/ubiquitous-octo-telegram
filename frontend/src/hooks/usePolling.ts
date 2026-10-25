import { useEffect, useRef } from 'react'

/** Calls fn every intervalMs, skipping ticks while the tab is hidden. Does not fire on mount. */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number) {
  const latest = useRef(fn)
  useEffect(() => {
    latest.current = fn
  })

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void latest.current()
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
}
