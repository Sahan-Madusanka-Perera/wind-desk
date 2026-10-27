import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

import type { Meta } from '../api/types'

const GATE_CLOSURE = /^([01]\d|2[0-2]):[0-5]\d$/

export const GATE_CLOSURE_PARAM = 'gc'

export function isValidGateClosure(value: string | null | undefined): value is string {
  return Boolean(value && GATE_CLOSURE.test(value))
}

/**
 * The decision time (gate closure on D-1) lives in the URL (?gc=09:50) so that every
 * view is shareable and the choice follows the user across pages.
 */
export function useGateClosure(
  meta: Meta | undefined,
): [string | undefined, (next: string) => void] {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get(GATE_CLOSURE_PARAM)
  const value = isValidGateClosure(fromUrl) ? fromUrl : meta?.defaultGateClosure

  const setValue = useCallback(
    (next: string) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (meta && next === meta.defaultGateClosure) updated.delete(GATE_CLOSURE_PARAM)
          else updated.set(GATE_CLOSURE_PARAM, next)
          return updated
        },
        { replace: true },
      )
    },
    [meta, setParams],
  )

  return [value, setValue]
}
