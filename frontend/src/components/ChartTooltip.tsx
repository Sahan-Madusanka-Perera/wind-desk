import type { ReactNode } from 'react'

import { LineKey, SwatchKey } from './SeriesKey'

export interface TooltipRow {
  key: string
  color: string
  value: string
  name: string
  dashed?: boolean
  swatch?: boolean
}

/** Terminal readout: values lead, series names follow, keyed by a short line of the ink. */
export function ChartTooltip({
  title,
  rows,
  foot,
}: {
  title: ReactNode
  rows: TooltipRow[]
  foot?: ReactNode
}) {
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {rows.map((row) => (
        <div className="chart-tooltip-row" key={row.key}>
          {row.swatch ? (
            <SwatchKey color={row.color} />
          ) : (
            <LineKey color={row.color} dashed={row.dashed} />
          )}
          <span>
            <span className="chart-tooltip-value">{row.value}</span>
            <span className="chart-tooltip-name">{row.name}</span>
          </span>
        </div>
      ))}
      {foot ? <div className="chart-tooltip-foot">{foot}</div> : null}
    </div>
  )
}
