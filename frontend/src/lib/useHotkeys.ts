import { useEffect, useRef } from 'react'

type Handler = (event: KeyboardEvent) => void

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Global single-key shortcuts (terminal style). Ignored while typing in a field or
 * when a modifier key is held, so browser and OS shortcuts keep working.
 */
export function useHotkeys(bindings: Record<string, Handler>): void {
  const latest = useRef(bindings)

  useEffect(() => {
    latest.current = bindings
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      const handler = latest.current[event.key]
      if (handler) {
        event.preventDefault()
        handler(event)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
