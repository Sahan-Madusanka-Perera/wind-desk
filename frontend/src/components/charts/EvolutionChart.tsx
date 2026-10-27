import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ActualPoint, Vintage } from '../../api/types'
import { formatAxisMw, formatMw, formatUkDayTime, formatUkTime } from '../../lib/format'
import { SERIES } from '../../lib/series'
import { drawOrder, vintageRole, vintageStroke } from '../../lib/vintages'
import { ChartTooltip, type TooltipRow } from '../ChartTooltip'
import { activeDot, AXIS, CURSOR, GRID, hourTicks, MARGIN, niceTicks } from '../../lib/chart'

type Row = { t: number; actual: number | null } & Record<string, number | null>

/**
 * How the forecast for one delivery day changed run by run. The run used for the
 * decision is the heavy line; runs published after gate closure are dashed because
 * the desk could not have acted on them.
 */
export function EvolutionChart({
  vintages,
  actuals,
  start,
  end,
  showActual,
  height = 260,
  label,
}: {
  vintages: Vintage[]
  actuals: ActualPoint[]
  start: string
  end: string
  showActual: boolean
  height?: number
  label: string
}) {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)

  const { rows, yTicks } = useMemo(() => {
    const map = new Map<number, Row>()
    const row = (t: number): Row => {
      let existing = map.get(t)
      if (!existing) {
        existing = { t, actual: null } as Row
        map.set(t, existing)
      }
      return existing
    }
    let max = 0
    vintages.forEach((vintage, index) => {
      for (const p of vintage.points) {
        row(Date.parse(p.startTime))[`v${index}`] = p.forecastMw
        max = Math.max(max, p.forecastMw)
      }
    })
    for (const a of actuals) {
      row(Date.parse(a.startTime)).actual = a.generationMw
      if (showActual) max = Math.max(max, a.generationMw)
    }
    return { rows: [...map.values()].toSorted((a, b) => a.t - b.t), yTicks: niceTicks(max) }
  }, [vintages, actuals, showActual])

  const ticks = useMemo(() => hourTicks(startMs, endMs, 3), [startMs, endMs])
  const earlier = vintages.filter((v) => vintageRole(v) === 'earlier')

  return (
    <div className="chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={MARGIN}>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis
            {...AXIS}
            dataKey="t"
            type="number"
            scale="time"
            domain={[startMs, endMs]}
            ticks={ticks}
            tickFormatter={(t: number) => formatUkTime(t)}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={44}
            domain={[0, yTicks.at(-1) ?? 1]}
            ticks={yTicks}
            tickFormatter={formatAxisMw}
          />
          <Tooltip
            cursor={CURSOR}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined
              if (!active || !row) return null
              const items: TooltipRow[] = []
              vintages.forEach((vintage, index) => {
                const value = row[`v${index}`]
                if (value === null || value === undefined) return
                const role = vintageRole(vintage)
                items.push({
                  key: vintage.publishTime,
                  color: role === 'later' ? 'var(--ink-2)' : SERIES.raw.color,
                  dashed: role === 'later',
                  value: `${formatMw(value)} MW`,
                  name: `run ${formatUkDayTime(vintage.publishTime)}${
                    role === 'used' ? ' · used' : role === 'later' ? ' · after GC' : ''
                  }`,
                })
              })
              if (showActual && row.actual !== null)
                items.push({
                  key: 'actual',
                  color: SERIES.actual.color,
                  value: `${formatMw(row.actual)} MW`,
                  name: SERIES.actual.label,
                })
              if (items.length === 0) return null
              return (
                <ChartTooltip title={`${formatUkDayTime(row.t)} UK`} rows={items.toReversed()} />
              )
            }}
          />
          {drawOrder(vintages).map(({ vintage, index }) => {
            const role = vintageRole(vintage)
            const olderRank = role === 'earlier' ? earlier.length - 1 - earlier.indexOf(vintage) : 0
            const stroke = vintageStroke(role, olderRank)
            return (
              <Line
                key={vintage.publishTime}
                dataKey={`v${index}`}
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeDasharray={stroke.dash}
                strokeOpacity={stroke.opacity}
                dot={false}
                activeDot={role === 'used' ? activeDot(SERIES.raw.color) : false}
                connectNulls
                isAnimationActive={false}
              />
            )
          })}
          {showActual ? (
            <Line
              dataKey="actual"
              stroke={SERIES.actual.color}
              strokeWidth={2}
              dot={false}
              activeDot={activeDot(SERIES.actual.color)}
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
