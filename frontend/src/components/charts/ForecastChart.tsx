import { useMemo, useState } from 'react'
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ActualPoint, ForecastPoint } from '../../api/types'
import {
  deliveryDateOf,
  formatAxisMw,
  formatDateCompact,
  formatHours,
  formatMw,
  formatUkDayTime,
  formatUkTime,
  ukDateHour,
} from '../../lib/format'
import { BAND_FILL, SERIES } from '../../lib/series'
import { ChartTooltip, type TooltipRow } from '../ChartTooltip'
import {
  activeDot,
  AXIS,
  CURSOR,
  deliveryDayTicks,
  GRID,
  hourTicks,
  MARGIN,
  niceTicks,
} from '../../lib/chart'

const HOUR_MS = 3_600_000

interface Row {
  t: number
  actual: number | null
  raw: number | null
  calibrated: number | null
  band: [number, number] | null
  lead: number | null
}

export interface ForecastChartProps {
  points: ForecastPoint[]
  actuals: ActualPoint[]
  start: string
  end: string
  showActual?: boolean
  showRaw?: boolean
  showCalibrated?: boolean
  height?: number
  brush?: boolean
  label: string
  /** Hour (epoch ms) selected elsewhere, e.g. a hovered blotter row. */
  highlight?: number | null
  onHover?: (time: number | null) => void
}

function buildRows(points: ForecastPoint[], actuals: ActualPoint[]): Row[] {
  const rows = new Map<number, Row>()
  const row = (t: number): Row => {
    let existing = rows.get(t)
    if (!existing) {
      existing = { t, actual: null, raw: null, calibrated: null, band: null, lead: null }
      rows.set(t, existing)
    }
    return existing
  }
  for (const a of actuals) row(Date.parse(a.startTime)).actual = a.generationMw
  for (const p of points) {
    const r = row(Date.parse(p.startTime))
    r.raw = p.forecastMw
    r.calibrated = p.calibratedMw
    r.band = p.lowerMw !== null && p.upperMw !== null ? [p.lowerMw, p.upperMw] : null
    r.lead = p.leadHours
  }
  return [...rows.values()].toSorted((a, b) => a.t - b.t)
}

function ticksFor(start: number, end: number): number[] {
  const days = (end - start) / 86_400_000
  if (days <= 1.5) return hourTicks(start, end, 3)
  if (days <= 3.5) return hourTicks(start, end, 12)
  if (days <= 10) return deliveryDayTicks(start, end, 1)
  return deliveryDayTicks(start, end, Math.ceil(days / 10))
}

function tickLabel(t: number, spanDays: number): string {
  if (spanDays <= 1.5) return formatUkTime(t)
  // Multi-day views tick at 23:00 UK, the start of each delivery day: label the day.
  const { hour } = ukDateHour(t)
  if (hour === 23) return formatDateCompact(deliveryDateOf(t))
  return formatUkTime(t)
}

/** Forecast versus outturn for one or more delivery days, with the calibrated range. */
export function ForecastChart({
  points,
  actuals,
  start,
  end,
  showActual = true,
  showRaw = true,
  showCalibrated = true,
  height = 320,
  brush = false,
  label,
  highlight = null,
  onHover,
}: ForecastChartProps) {
  const rows = useMemo(() => buildRows(points, actuals), [points, actuals])
  const [visible, setVisible] = useState<[number, number] | null>(null)

  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  const [visStart, visEnd] = brush && visible ? visible : [startMs, endMs]
  const spanDays = (visEnd - visStart) / 86_400_000
  const ticks = useMemo(() => ticksFor(visStart, visEnd), [visStart, visEnd])

  const yTicks = useMemo(() => {
    let max = 0
    for (const r of rows) {
      max = Math.max(
        max,
        showActual ? (r.actual ?? 0) : 0,
        showRaw ? (r.raw ?? 0) : 0,
        showCalibrated ? (r.band?.[1] ?? r.calibrated ?? 0) : 0,
      )
    }
    return niceTicks(max)
  }, [rows, showActual, showRaw, showCalibrated])

  const hasCalibration = points.some((p) => p.calibratedMw !== null)

  return (
    <div className="chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={rows}
          margin={MARGIN}
          onMouseMove={(state) => {
            const t = Number(state?.activeLabel)
            if (onHover && Number.isFinite(t)) onHover(Math.floor(t / HOUR_MS) * HOUR_MS)
          }}
          onMouseLeave={() => onHover?.(null)}
        >
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis
            {...AXIS}
            dataKey="t"
            type="number"
            scale="time"
            domain={brush ? ['dataMin', 'dataMax'] : [startMs, endMs]}
            ticks={ticks}
            tickFormatter={(t: number) => tickLabel(t, spanDays)}
            allowDataOverflow
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
              if (showActual && row.actual !== null)
                items.push({
                  key: 'actual',
                  color: SERIES.actual.color,
                  value: `${formatMw(row.actual)} MW`,
                  name: SERIES.actual.label,
                })
              if (showRaw && row.raw !== null)
                items.push({
                  key: 'raw',
                  color: SERIES.raw.color,
                  value: `${formatMw(row.raw)} MW`,
                  name: SERIES.raw.label,
                })
              if (showCalibrated && row.calibrated !== null)
                items.push({
                  key: 'calibrated',
                  color: SERIES.calibrated.color,
                  value: `${formatMw(row.calibrated)} MW`,
                  name: SERIES.calibrated.label,
                })
              if (showCalibrated && row.band)
                items.push({
                  key: 'band',
                  color: BAND_FILL,
                  swatch: true,
                  value: `${formatMw(row.band[0])}–${formatMw(row.band[1])}`,
                  name: '80% range',
                })
              if (items.length === 0) return null
              return (
                <ChartTooltip
                  title={`${formatUkDayTime(row.t)} UK`}
                  rows={items}
                  foot={row.lead !== null ? `Forecast lead ${formatHours(row.lead)}` : undefined}
                />
              )
            }}
          />
          {highlight !== null ? (
            <ReferenceLine
              x={highlight}
              stroke="var(--accent)"
              strokeWidth={1}
              ifOverflow="hidden"
            />
          ) : null}
          {showCalibrated && hasCalibration ? (
            <Area
              dataKey="band"
              stroke="none"
              fill={BAND_FILL}
              fillOpacity={1}
              connectNulls
              isAnimationActive={false}
              activeDot={false}
              name="80% range"
            />
          ) : null}
          {showRaw ? (
            <Line
              dataKey="raw"
              stroke={SERIES.raw.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={false}
              activeDot={activeDot(SERIES.raw.color)}
              connectNulls
              isAnimationActive={false}
              name={SERIES.raw.label}
            />
          ) : null}
          {showCalibrated && hasCalibration ? (
            <Line
              dataKey="calibrated"
              stroke={SERIES.calibrated.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={false}
              activeDot={activeDot(SERIES.calibrated.color)}
              connectNulls
              isAnimationActive={false}
              name={SERIES.calibrated.label}
            />
          ) : null}
          {showActual ? (
            <Line
              dataKey="actual"
              stroke={SERIES.actual.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              dot={false}
              activeDot={activeDot(SERIES.actual.color)}
              connectNulls
              isAnimationActive={false}
              name={SERIES.actual.label}
            />
          ) : null}
          {brush ? (
            <Brush
              dataKey="t"
              height={26}
              travellerWidth={8}
              stroke="var(--rule-strong)"
              fill="var(--bg)"
              tickFormatter={(t: number) => formatDateCompact(deliveryDateOf(t))}
              onChange={(range) => {
                const first = rows[range.startIndex ?? 0]
                const last = rows[range.endIndex ?? rows.length - 1]
                if (first && last) setVisible([first.t, last.t])
              }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
