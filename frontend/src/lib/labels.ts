import type { LevelAccuracy } from '../api/types'
import { formatGw } from './format'

/** "18.0–21.0": a forecast-level bin in GW. */
export function levelLabel(bin: LevelAccuracy): string {
  return `${formatGw(bin.lowerMw)}–${formatGw(bin.upperMw)}`
}
