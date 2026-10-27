import { useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useMeta, useTimeseries } from '../api/queries'
import type { Meta, SeriesMode, TimeSeries } from '../api/types'
import { ForecastChart } from '../components/charts/ForecastChart'
import { DataTable } from '../components/DataTable'
import { GateClosureControl } from '../components/GateClosureControl'
import { Panel } from '../components/Panel'
import { Quotes, type QuoteItem } from '../components/Quotes'
import { BandKey, LineKey } from '../components/SeriesKey'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { addDays, clampDate, isIsoDate } from '../lib/dates'
import {
  deliveryDateOf,
  formatDateCompact,
  formatDateShort,
  formatHours,
  formatMw,
  formatSignedMw,
  formatUkDayTime,
  formatUkTime,
} from '../lib/format'
import { SERIES, type SeriesId } from '../lib/series'
import { useGateClosure } from '../lib/useGateClosure'

const DEFAULT_LEAD = 24

interface Preset {
  id: string
  label: string
  from: string
  to: string
}

function presetsFor(meta: Meta): Preset[] {
  const presets: Preset[] = []
  for (let start = meta.firstDeliveryDate, week = 1; start <= meta.lastDeliveryDate; week += 1) {
    const end = clampDate(addDays(start, 6), start, meta.lastDeliveryDate)
    presets.push({
      id: `w${week}`,
      label: `${formatDateCompact(start)}–${formatDateCompact(end)}`,
      from: start,
      to: end,
    })
    start = addDays(end, 1)
  }
  presets.push({
    id: 'all',
    label: 'All days',
    from: meta.firstDeliveryDate,
    to: meta.lastDeliveryDate,
  })
  return presets
}

export function ExplorerPage() {
  const meta = useMeta()
  if (meta.isPending) return <LoadingState label="Loading WindDesk" />
  if (meta.isError) return <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
  return <ExplorerView meta={meta.data} />
}

function ExplorerView({ meta }: { meta: Meta }) {
  const [params, setParams] = useSearchParams()
  const [gateClosure, setGateClosure] = useGateClosure(meta)
  const [channels, setChannels] = useState<Record<SeriesId, boolean>>({
    actual: true,
    raw: true,
    calibrated: true,
  })
  const fromId = useId()
  const toId = useId()
  const leadId = useId()

  const first = meta.firstDeliveryDate
  const last = meta.lastDeliveryDate
  const fromParam = params.get('from')
  const toParam = params.get('to')
  const from = isIsoDate(fromParam) ? clampDate(fromParam, first, last) : first
  const rawTo = isIsoDate(toParam)
    ? clampDate(toParam, first, last)
    : clampDate(addDays(first, 6), first, last)
  const to = rawTo < from ? from : rawTo
  const mode: SeriesMode = params.get('mode') === 'lead' ? 'lead' : 'decision'
  const leadParam = Number(params.get('lead'))
  const leadHours =
    Number.isInteger(leadParam) &&
    leadParam >= 0 &&
    leadParam <= meta.maxLeadHours &&
    params.has('lead')
      ? leadParam
      : DEFAULT_LEAD

  const update = (changes: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  const series = useTimeseries({ from, to, mode, gateClosure, leadHours })
  const presets = useMemo(() => presetsFor(meta), [meta])

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Forecast explorer</h1>
        <p className="page-lede">
          Compare forecast and outturn over any run of delivery days, either exactly as the desk saw
          them at gate closure or at a fixed forecast lead time.
        </p>
      </div>

      <div className="cmdbar">
        <div className="cmd-group">
          <label className="cmd-label" htmlFor={fromId}>
            From
          </label>
          <input
            id={fromId}
            className="field"
            type="date"
            min={first}
            max={last}
            value={from}
            onChange={(event) => {
              const value = event.target.value
              if (isIsoDate(value)) update({ from: value, to: value > to ? value : to })
            }}
          />
          <label className="cmd-label" htmlFor={toId}>
            To
          </label>
          <input
            id={toId}
            className="field"
            type="date"
            min={from}
            max={last}
            value={to}
            onChange={(event) => {
              const value = event.target.value
              if (isIsoDate(value)) update({ to: value < from ? from : value })
            }}
          />
        </div>
        <div className="segmented" role="group" aria-label="Date range presets">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={preset.from === from && preset.to === to}
              onClick={() => update({ from: preset.from, to: preset.to })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="cmd-group">
          <span className="cmd-label">Forecast</span>
          <div className="segmented" role="group" aria-label="Forecast selection">
            <button
              type="button"
              aria-pressed={mode === 'decision'}
              onClick={() => update({ mode: null })}
              title="The forecast available at gate closure on the day before delivery"
            >
              At gate closure
            </button>
            <button
              type="button"
              aria-pressed={mode === 'lead'}
              onClick={() => update({ mode: 'lead' })}
              title="For each hour, the latest forecast published at least N hours earlier"
            >
              Fixed lead time
            </button>
          </div>
        </div>
        {mode === 'decision' && gateClosure ? (
          <GateClosureControl
            value={gateClosure}
            presets={meta.gateClosurePresets}
            onChange={setGateClosure}
          />
        ) : null}
        {mode === 'lead' ? (
          <div className="cmd-group">
            <label className="cmd-label" htmlFor={leadId}>
              Lead ≥
            </label>
            <input
              id={leadId}
              className="range"
              type="range"
              min={0}
              max={meta.maxLeadHours}
              step={1}
              value={leadHours}
              onChange={(event) => update({ lead: event.target.value })}
            />
            <output htmlFor={leadId} className="cmd-meta" style={{ minWidth: '3.5em' }}>
              <strong>{leadHours} h</strong>
            </output>
          </div>
        ) : null}
      </div>

      {series.isPending ? (
        <LoadingState label="Loading time series" />
      ) : series.isError ? (
        <ErrorState error={series.error} onRetry={() => void series.refetch()} />
      ) : series.data ? (
        <ExplorerBody
          data={series.data}
          channels={channels}
          onToggle={(id) => setChannels((current) => ({ ...current, [id]: !current[id] }))}
          refreshing={series.isPlaceholderData}
          coverage={meta.bandCoverage}
        />
      ) : null}
    </>
  )
}

/** "1,991 → 1,221": raw value, then calibrated when available. */
function pair(rawValue: number | undefined, calValue: number | undefined, signed = false): string {
  const fmt = signed ? formatSignedMw : formatMw
  if (rawValue === undefined) return '–'
  return calValue === undefined ? fmt(rawValue) : `${fmt(rawValue)} → ${fmt(calValue)}`
}

function ExplorerBody({
  data,
  channels,
  onToggle,
  refreshing,
  coverage,
}: {
  data: TimeSeries
  channels: Record<SeriesId, boolean>
  onToggle: (id: SeriesId) => void
  refreshing: boolean
  coverage: number
}) {
  const { raw, calibrated } = data.metrics
  if (data.points.length === 0) {
    return (
      <EmptyState
        title="No forecasts for this selection"
        text="No WINDFOR run satisfies this lead time for the chosen days. Choose a shorter lead time."
      />
    )
  }

  const hasCalibration = calibrated !== null
  const quotes: QuoteItem[] = [
    {
      id: 'mae',
      label: 'Mean abs. error',
      value: pair(raw?.maeMw, calibrated?.maeMw),
      unit: 'MW',
      sub: hasCalibration ? 'NESO → calibrated' : 'NESO forecast',
    },
    {
      id: 'bias',
      label: 'Bias',
      value: pair(raw?.biasMw, calibrated?.biasMw, true),
      unit: 'MW',
      sub: 'Positive = over-forecast',
    },
    {
      id: 'p90',
      label: 'P90 abs. error',
      value: pair(raw?.p90AbsErrorMw, calibrated?.p90AbsErrorMw),
      unit: 'MW',
    },
    {
      id: 'n',
      label: 'Hours scored',
      value: raw ? String(raw.count) : '0',
      sub: `${formatDateShort(data.fromDate)} – ${formatDateShort(data.toDate)}`,
    },
  ]

  const toggles: SeriesId[] = hasCalibration ? ['actual', 'raw', 'calibrated'] : ['actual', 'raw']

  return (
    <>
      <Quotes items={quotes} label="Accuracy over the selected range" />
      <Panel
        title={
          data.mode === 'decision'
            ? `Forecast at gate closure ${data.gateClosure}`
            : `Forecast with lead ≥ ${data.leadHours} h`
        }
        sub="Drag the handles under the chart to zoom"
        refreshing={refreshing}
        actions={
          <div className="keys" role="group" aria-label="Series shown">
            {toggles.map((id) => (
              <label key={id} className="toggle">
                <input type="checkbox" checked={channels[id]} onChange={() => onToggle(id)} />
                <LineKey color={SERIES[id].color} />
                {SERIES[id].label}
              </label>
            ))}
            {hasCalibration && channels.calibrated ? <BandKey coverage={coverage} /> : null}
          </div>
        }
        table={
          <DataTable
            caption="Hourly forecast and outturn (MW)"
            rows={data.points}
            rowKey={(p) => p.startTime}
            columns={[
              {
                key: 't',
                header: 'Hour UK',
                rowHeader: true,
                cell: (p) =>
                  `${formatDateShort(deliveryDateOf(p.startTime))} ${formatUkTime(p.startTime)}`,
              },
              { key: 'pub', header: 'Run', cell: (p) => formatUkDayTime(p.publishTime) },
              { key: 'lead', header: 'Lead', cell: (p) => formatHours(p.leadHours) },
              { key: 'raw', header: 'Raw', cell: (p) => formatMw(p.forecastMw) },
              {
                key: 'cal',
                header: 'Calibrated',
                cell: (p) => (p.calibratedMw !== null ? formatMw(p.calibratedMw) : '–'),
              },
              {
                key: 'act',
                header: 'Outturn',
                cell: (p) => (p.actualMw !== null ? formatMw(p.actualMw) : '–'),
              },
              {
                key: 'err',
                header: 'Err raw',
                cell: (p) =>
                  p.actualMw !== null ? formatSignedMw(p.forecastMw - p.actualMw) : '–',
              },
            ]}
          />
        }
      >
        <ForecastChart
          key={`${data.fromDate}-${data.toDate}-${data.mode}`}
          points={data.points}
          actuals={data.actuals}
          start={data.window.start}
          end={data.window.end}
          showActual={channels.actual}
          showRaw={channels.raw}
          showCalibrated={channels.calibrated}
          height={380}
          brush
          label={`Forecast versus outturn, delivery ${data.fromDate} to ${data.toDate}`}
        />
      </Panel>
    </>
  )
}
