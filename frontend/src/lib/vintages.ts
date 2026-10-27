import type { Vintage } from '../api/types'
import { SERIES } from './series'

export type VintageRole = 'used' | 'earlier' | 'later'

export function vintageRole(vintage: Vintage): VintageRole {
  if (vintage.usedForDecision) return 'used'
  return vintage.availableAtDecision ? 'earlier' : 'later'
}

/** Line form carries availability, never hue: solid = known at gate closure, dashed = not. */
export function vintageStroke(role: VintageRole, olderRank: number) {
  if (role === 'used') return { color: SERIES.raw.color, width: 2.5, dash: undefined, opacity: 1 }
  if (role === 'earlier')
    return {
      color: SERIES.raw.color,
      width: 1.25,
      dash: undefined,
      opacity: Math.max(0.35, 0.75 - olderRank * 0.1),
    }
  return { color: 'var(--ink-2)', width: 1.25, dash: '4 3', opacity: 0.7 }
}

const DRAW_RANK: Record<VintageRole, number> = { later: 0, earlier: 1, used: 2 }

/** Paint dashed runs first and the decision run last, so it is never hidden. */
export function drawOrder(vintages: Vintage[]): { vintage: Vintage; index: number }[] {
  return vintages
    .map((vintage, index) => ({ vintage, index }))
    .toSorted((a, b) => DRAW_RANK[vintageRole(a.vintage)] - DRAW_RANK[vintageRole(b.vintage)])
}
