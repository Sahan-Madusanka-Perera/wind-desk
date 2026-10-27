import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type {
  DailyAccuracy,
  HistogramBin,
  HourAccuracy,
  LeadAccuracy,
  LevelAccuracy,
  ScatterPoint,
} from '../../api/types'
import {
  formatAxisMw,
  formatDateCompact,
  formatDateShort,
  formatHours,
  formatMw,
  formatSignedMw,
  formatUkDayTime,
} from '../../lib/format'
import { levelLabel } from '../../lib/labels'
import { SERIES } from '../../lib/series'
import { ChartTooltip } from '../ChartTooltip'
import { activeDot, AXIS, CURSOR, GRID, MARGIN, niceTicks, symmetricTicks } from '../../lib/chart'
import { RoundedBar } from './RoundedBar'

const BAR_CURSOR = { fill: 'rgb(255 255 255 / 4%)' }

/* ------------------------------------------------------------------ lead time */

export function LeadChart({
  data,
  decisionMin,
  decisionMax,
  height = 260,
}: {
  data: LeadAccuracy[]
  decisionMin: number | null
  decisionMax: number | null
  height?: number
}) {
  const yTicks = niceTicks(Math.max(...data.map((d) => d.maeMw)))
  return (
    <div
      className="chart"
      role="img"
      aria-label="Mean absolute error of the NESO forecast by minimum lead time, 0 to 48 hours"
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={MARGIN}>
          <CartesianGrid {...GRID} vertical={false} />
          {decisionMin !== null && decisionMax !== null ? (
            <ReferenceArea
              x1={decisionMin}
              x2={decisionMax}
              fill="rgb(255 255 255 / 5%)"
              stroke="none"
              ifOverflow="extendDomain"
              label={{
                value: 'Day-ahead decision window',
                position: 'insideTop',
                fill: 'var(--ink-2)',
                fontSize: 11,
              }}
            />
          ) : null}
          <XAxis
            {...AXIS}
            dataKey="leadHours"
            type="number"
            domain={[0, 48]}
            ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
            tickFormatter={(h: number) => `${h}h`}
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
              const row = payload?.[0]?.payload as LeadAccuracy | undefined
              if (!active || !row) return null
              return (
                <ChartTooltip
                  title={`Published ≥ ${formatHours(row.leadHours)} ahead`}
                  rows={[
                    {
                      key: 'mae',
                      color: SERIES.raw.color,
                      value: `${formatMw(row.maeMw)} MW`,
                      name: 'mean abs. error',
                    },
                  ]}
                  foot={`Bias ${formatSignedMw(row.biasMw)} MW · P90 ${formatMw(row.p90AbsErrorMw)} MW · n=${row.count}`}
                />
              )
            }}
          />
          <Line
            dataKey="maeMw"
            stroke={SERIES.raw.color}
            strokeWidth={2}
            dot={false}
            activeDot={activeDot(SERIES.raw.color)}
            isAnimationActive={false}
            name="Mean absolute error"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ daily */

export function DailyChart({
  data,
  gateClosure,
  height = 260,
}: {
  data: DailyAccuracy[]
  gateClosure: string
  height?: number
}) {
  const navigate = useNavigate()
  const yTicks = niceTicks(
    Math.max(...data.map((d) => Math.max(d.rawMaeMw, d.calibratedMaeMw ?? 0))),
  )
  return (
    <div
      className="chart"
      role="img"
      aria-label="Mean absolute error per delivery day, NESO forecast versus calibrated forecast"
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={MARGIN}
          onClick={(state) => {
            const date = state?.activeLabel
            if (typeof date === 'string') navigate(`/briefing/${date}?gc=${gateClosure}`)
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis
            {...AXIS}
            dataKey="deliveryDate"
            tickFormatter={(d: string) => formatDateCompact(d)}
            interval="preserveStartEnd"
            minTickGap={24}
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
              const row = payload?.[0]?.payload as DailyAccuracy | undefined
              if (!active || !row) return null
              return (
                <ChartTooltip
                  title={`Delivery ${formatDateShort(row.deliveryDate)}`}
                  rows={[
                    {
                      key: 'raw',
                      color: SERIES.raw.color,
                      value: `${formatMw(row.rawMaeMw)} MW`,
                      name: `${SERIES.raw.label} MAE`,
                    },
                    ...(row.calibratedMaeMw !== null
                      ? [
                          {
                            key: 'cal',
                            color: SERIES.calibrated.color,
                            value: `${formatMw(row.calibratedMaeMw)} MW`,
                            name: `${SERIES.calibrated.label} MAE`,
                          },
                        ]
                      : []),
                  ]}
                  foot="Click to open this day's briefing"
                />
              )
            }}
          />
          <Line
            dataKey="rawMaeMw"
            stroke={SERIES.raw.color}
            strokeWidth={2}
            dot={false}
            activeDot={activeDot(SERIES.raw.color)}
            isAnimationActive={false}
            name={SERIES.raw.label}
          />
          <Line
            dataKey="calibratedMaeMw"
            stroke={SERIES.calibrated.color}
            strokeWidth={2}
            dot={false}
            activeDot={activeDot(SERIES.calibrated.color)}
            isAnimationActive={false}
            name={SERIES.calibrated.label}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ forecast level */

export function LevelChart({ data, height = 260 }: { data: LevelAccuracy[]; height?: number }) {
  const rows = useMemo(() => data.map((d) => ({ ...d, label: levelLabel(d) })), [data])
  const extent = Math.max(
    ...data.map((d) => Math.max(Math.abs(d.rawBiasMw), Math.abs(d.calibratedBiasMw ?? 0))),
  )
  const yTicks = symmetricTicks(extent)
  return (
    <div
      className="chart"
      role="img"
      aria-label="Average bias by forecast level, NESO forecast versus calibrated forecast"
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={MARGIN} barGap={2} barCategoryGap="22%">
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis {...AXIS} dataKey="label" />
          <YAxis
            {...AXIS}
            axisLine={false}
            width={44}
            domain={[yTicks[0] ?? -1, yTicks.at(-1) ?? 1]}
            ticks={yTicks}
            tickFormatter={formatAxisMw}
          />
          <ReferenceLine y={0} stroke="var(--ink-3)" />
          <Tooltip
            cursor={BAR_CURSOR}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (LevelAccuracy & { label: string }) | undefined
              if (!active || !row) return null
              return (
                <ChartTooltip
                  title={`Forecast ${row.label} GW · ${row.count} h`}
                  rows={[
                    {
                      key: 'raw',
                      color: SERIES.raw.color,
                      swatch: true,
                      value: `${formatSignedMw(row.rawBiasMw)} MW`,
                      name: `${SERIES.raw.label} bias`,
                    },
                    ...(row.calibratedBiasMw !== null
                      ? [
                          {
                            key: 'cal',
                            color: SERIES.calibrated.color,
                            swatch: true,
                            value: `${formatSignedMw(row.calibratedBiasMw)} MW`,
                            name: `${SERIES.calibrated.label} bias`,
                          },
                        ]
                      : []),
                  ]}
                  foot="Positive = over-forecast (less wind than forecast)"
                />
              )
            }}
          />
          <Bar
            dataKey="rawBiasMw"
            fill={SERIES.raw.color}
            maxBarSize={24}
            shape={RoundedBar}
            isAnimationActive={false}
            name={SERIES.raw.label}
          />
          <Bar
            dataKey="calibratedBiasMw"
            fill={SERIES.calibrated.color}
            maxBarSize={24}
            shape={RoundedBar}
            isAnimationActive={false}
            name={SERIES.calibrated.label}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ hour of day */

export function HourChart({ data, height = 260 }: { data: HourAccuracy[]; height?: number }) {
  const yTicks = niceTicks(Math.max(...data.map((d) => d.rawMaeMw)))
  return (
    <div
      className="chart"
      role="img"
      aria-label="Mean absolute error by UK hour of day, NESO forecast versus calibrated forecast"
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={MARGIN}>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis
            {...AXIS}
            dataKey="hour"
            type="number"
            domain={[0, 23]}
            ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
            tickFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
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
              const row = payload?.[0]?.payload as HourAccuracy | undefined
              if (!active || !row) return null
              const hour = String(row.hour).padStart(2, '0')
              return (
                <ChartTooltip
                  title={`${hour}:00–${hour}:59 UK · ${row.count} h`}
                  rows={[
                    {
                      key: 'raw',
                      color: SERIES.raw.color,
                      value: `${formatMw(row.rawMaeMw)} MW`,
                      name: `${SERIES.raw.label} MAE`,
                    },
                    ...(row.calibratedMaeMw !== null
                      ? [
                          {
                            key: 'cal',
                            color: SERIES.calibrated.color,
                            value: `${formatMw(row.calibratedMaeMw)} MW`,
                            name: `${SERIES.calibrated.label} MAE`,
                          },
                        ]
                      : []),
                  ]}
                />
              )
            }}
          />
          <Line
            dataKey="rawMaeMw"
            stroke={SERIES.raw.color}
            strokeWidth={2}
            dot={false}
            activeDot={activeDot(SERIES.raw.color)}
            isAnimationActive={false}
          />
          <Line
            dataKey="calibratedMaeMw"
            stroke={SERIES.calibrated.color}
            strokeWidth={2}
            dot={false}
            activeDot={activeDot(SERIES.calibrated.color)}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ distribution */

export function HistogramChart({
  data,
  binWidth,
  height = 260,
}: {
  data: HistogramBin[]
  binWidth: number
  height?: number
}) {
  const rows = useMemo(() => data.map((d) => ({ ...d, mid: (d.lowerMw + d.upperMw) / 2 })), [data])
  const low = data[0]?.lowerMw ?? 0
  const high = data.at(-1)?.upperMw ?? 0
  const tickStep = high - low > 12_000 ? 2000 : 1000
  const ticks: number[] = []
  for (let v = Math.ceil(low / tickStep) * tickStep; v <= high; v += tickStep) ticks.push(v)
  return (
    <div
      className="chart"
      role="img"
      aria-label={`Distribution of hourly forecast errors in ${binWidth} MW bins, NESO versus calibrated`}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={MARGIN} barGap={1} barCategoryGap="12%">
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis
            {...AXIS}
            dataKey="mid"
            type="number"
            domain={[low, high]}
            ticks={ticks}
            tickFormatter={formatAxisMw}
          />
          <YAxis {...AXIS} axisLine={false} width={36} allowDecimals={false} />
          <ReferenceLine x={0} stroke="var(--ink-3)" />
          <Tooltip
            cursor={BAR_CURSOR}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as HistogramBin | undefined
              if (!active || !row) return null
              return (
                <ChartTooltip
                  title={`Error ${formatSignedMw(row.lowerMw)} to ${formatSignedMw(row.upperMw)} MW`}
                  rows={[
                    {
                      key: 'raw',
                      color: SERIES.raw.color,
                      swatch: true,
                      value: `${row.rawCount} h`,
                      name: SERIES.raw.label,
                    },
                    {
                      key: 'cal',
                      color: SERIES.calibrated.color,
                      swatch: true,
                      value: `${row.calibratedCount} h`,
                      name: SERIES.calibrated.label,
                    },
                  ]}
                  foot="Error = forecast − outturn"
                />
              )
            }}
          />
          <Bar
            dataKey="rawCount"
            fill={SERIES.raw.color}
            maxBarSize={12}
            shape={RoundedBar}
            isAnimationActive={false}
          />
          <Bar
            dataKey="calibratedCount"
            fill={SERIES.calibrated.color}
            maxBarSize={12}
            shape={RoundedBar}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ scatter */

export function ScatterPlot({ data, height = 300 }: { data: ScatterPoint[]; height?: number }) {
  const { raw, calibrated, ticks } = useMemo(() => {
    const rawPoints = data.map((d) => ({ x: d.forecastMw, y: d.actualMw, t: d.startTime }))
    const calibratedPoints = data.flatMap((d) =>
      d.calibratedMw === null ? [] : [{ x: d.calibratedMw, y: d.actualMw, t: d.startTime }],
    )
    const largest = Math.max(
      0,
      ...rawPoints.map((p) => Math.max(p.x, p.y)),
      ...calibratedPoints.map((p) => p.x),
    )
    return { raw: rawPoints, calibrated: calibratedPoints, ticks: niceTicks(largest) }
  }, [data])
  const max = ticks.at(-1) ?? 1

  return (
    <div
      className="chart"
      role="img"
      aria-label="Forecast versus outturn for every hour, NESO forecast and calibrated forecast, with the perfect-forecast diagonal"
    >
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={MARGIN}>
          <CartesianGrid {...GRID} />
          <XAxis
            {...AXIS}
            dataKey="x"
            type="number"
            domain={[0, max]}
            ticks={ticks}
            tickFormatter={formatAxisMw}
          />
          <YAxis
            {...AXIS}
            axisLine={false}
            dataKey="y"
            type="number"
            width={44}
            domain={[0, max]}
            ticks={ticks}
            tickFormatter={formatAxisMw}
          />
          <ReferenceLine
            segment={[
              { x: 0, y: 0 },
              { x: max, y: max },
            ]}
            stroke="var(--ink-3)"
            ifOverflow="hidden"
          />
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as { x: number; y: number; t: string } | undefined
              const series = payload?.[0]?.name
              if (!active || !point) return null
              const isRaw = series === SERIES.raw.label
              return (
                <ChartTooltip
                  title={`${formatUkDayTime(point.t)} UK`}
                  rows={[
                    {
                      key: 'f',
                      color: isRaw ? SERIES.raw.color : SERIES.calibrated.color,
                      swatch: true,
                      value: `${formatMw(point.x)} MW`,
                      name: isRaw ? SERIES.raw.label : SERIES.calibrated.label,
                    },
                    {
                      key: 'a',
                      color: SERIES.actual.color,
                      swatch: true,
                      value: `${formatMw(point.y)} MW`,
                      name: SERIES.actual.label,
                    },
                  ]}
                  foot={`Error ${formatSignedMw(point.x - point.y)} MW`}
                />
              )
            }}
          />
          <Scatter
            name={SERIES.raw.label}
            data={raw}
            fill={SERIES.raw.color}
            fillOpacity={0.6}
            isAnimationActive={false}
            shape="circle"
            legendType="circle"
          />
          <Scatter
            name={SERIES.calibrated.label}
            data={calibrated}
            fill={SERIES.calibrated.color}
            fillOpacity={0.6}
            isAnimationActive={false}
            shape="circle"
            legendType="circle"
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
