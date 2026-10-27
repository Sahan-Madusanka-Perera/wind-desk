import type { ReactNode } from 'react'

import { BAND_FILL, SERIES, type SeriesId } from '../lib/series'

export function LineKey({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      className={dashed ? 'key-line key-line-dashed' : 'key-line'}
      style={{ color }}
      aria-hidden="true"
    />
  )
}

export function SwatchKey({ color }: { color: string }) {
  return <span className="key-swatch" style={{ background: color }} aria-hidden="true" />
}

export function SeriesKey({ id, label }: { id: SeriesId; label?: ReactNode }) {
  return (
    <span className="key">
      <LineKey color={SERIES[id].color} />
      {label ?? SERIES[id].label}
    </span>
  )
}

export function BandKey({ coverage }: { coverage: number }) {
  return (
    <span className="key">
      <SwatchKey color={BAND_FILL} />
      {Math.round(coverage * 100)}% range
    </span>
  )
}

export function BarKey({ id, label }: { id: SeriesId; label?: ReactNode }) {
  return (
    <span className="key">
      <SwatchKey color={SERIES[id].color} />
      {label ?? SERIES[id].label}
    </span>
  )
}
