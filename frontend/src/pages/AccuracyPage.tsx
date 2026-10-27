import { useMemo } from 'react'
import { Link } from 'react-router'

import { useAccuracy, useMeta } from '../api/queries'
import type { Accuracy, ErrorMetrics, Meta, ScatterPoint } from '../api/types'
import {
  DailyChart,
  HistogramChart,
  HourChart,
  LeadChart,
  LevelChart,
  ScatterPlot,
} from '../components/charts/AccuracyCharts'
import { DataTable } from '../components/DataTable'
import { GateClosureControl } from '../components/GateClosureControl'
import { ArrowUpRight } from '../components/Icons'
import { Panel } from '../components/Panel'
import { BarKey, LineKey, SeriesKey } from '../components/SeriesKey'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import {
  deliveryDateOf,
  formatDateLong,
  formatDateShort,
  formatGw,
  formatHours,
  formatMw,
  formatPct,
  formatSignedMw,
  formatSignedPct,
  formatUkTime,
} from '../lib/format'
import { levelLabel } from '../lib/labels'
import { SERIES } from '../lib/series'
import { useGateClosure } from '../lib/useGateClosure'

export function AccuracyPage() {
  const meta = useMeta()
  if (meta.isPending) return <LoadingState label="Loading WindDesk" />
  if (meta.isError) return <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
  return <AccuracyView meta={meta.data} />
}

function AccuracyView({ meta }: { meta: Meta }) {
  const [gateClosure, setGateClosure] = useGateClosure(meta)
  const accuracy = useAccuracy(gateClosure)

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Accuracy report</h1>
        <p className="page-lede">
          How far wrong was the wind forecast the desk had at gate closure, for every purchase
          decision taken {formatDateLong(meta.firstDecisionDate)} to{' '}
          {formatDateLong(meta.lastDecisionDate)}, and how much does calibration help?
        </p>
      </div>

      <div className="cmdbar">
        {gateClosure ? (
          <GateClosureControl
            value={gateClosure}
            presets={meta.gateClosurePresets}
            onChange={setGateClosure}
          />
        ) : null}
        <div className="cmd-spacer" />
        {accuracy.data ? (
          <div className="cmd-meta">
            <strong>{accuracy.data.deliveryDays}</strong> delivery days ·{' '}
            <strong>{accuracy.data.metrics.raw?.count ?? 0}</strong> hourly products · lead{' '}
            {accuracy.data.decisionLeadHoursMin !== null
              ? formatHours(accuracy.data.decisionLeadHoursMin)
              : '–'}
            –
            {accuracy.data.decisionLeadHoursMax !== null
              ? formatHours(accuracy.data.decisionLeadHoursMax)
              : '–'}
          </div>
        ) : null}
      </div>

      {accuracy.isPending ? (
        <LoadingState label="Loading accuracy report" />
      ) : accuracy.isError ? (
        <ErrorState error={accuracy.error} onRetry={() => void accuracy.refetch()} />
      ) : accuracy.data ? (
        <AccuracyBody report={accuracy.data} refreshing={accuracy.isPlaceholderData} />
      ) : null}
    </>
  )
}

function AccuracyBody({ report, refreshing }: { report: Accuracy; refreshing: boolean }) {
  const findings = useFindings(report)
  const misses = useLargestMisses(report.scatter, 8)
  const gc = report.gateClosure

  if (!report.metrics.raw) {
    return (
      <EmptyState
        title="No hours to score"
        text="No forecast hours with a matching outturn were found for this gate closure."
      />
    )
  }

  return (
    <>
      <div className="grid-2">
        <Panel
          title="Headline accuracy"
          sub={`${report.metrics.raw.count} hourly products · forecast at gate closure vs outturn`}
          refreshing={refreshing}
          flush
          note="Error = forecast − outturn. Positive bias means over-forecast: less wind arrived than forecast, so the desk is short."
        >
          <HeadlineTable report={report} />
        </Panel>

        <Panel
          title="Safety margin"
          sub="MW to hold back from each hourly forecast"
          refreshing={refreshing}
          flush
          note="Read as: to cover the wind shortfall in 90% of hours, plan on the forecast minus this margin. Each forecast's margin is measured on its own errors over the pilot."
        >
          <DataTable
            caption="Shortfall quantiles of forecast − outturn (MW)"
            scroll={false}
            rows={report.buffers}
            rowKey={(d) => String(d.confidence)}
            columns={[
              {
                key: 'c',
                header: 'Cover',
                rowHeader: true,
                cell: (d) => `${Math.round(d.confidence * 100)}% of hours`,
              },
              { key: 'r', header: 'NESO forecast', cell: (d) => marginText(d.rawMw) },
              {
                key: 'k',
                header: 'Calibrated',
                cell: (d) => (d.calibratedMw !== null ? marginText(d.calibratedMw) : '–'),
              },
            ]}
          />
        </Panel>
      </div>

      <div className="grid-2">
        <Panel
          title="Error by delivery day"
          sub="Mean absolute error · click a day to open its briefing"
          refreshing={refreshing}
          actions={
            <div className="keys">
              <SeriesKey id="raw" />
              <SeriesKey id="calibrated" />
            </div>
          }
          note={findings.calibration}
          table={
            <DataTable
              caption="Daily accuracy (MW unless stated)"
              rows={report.daily}
              rowKey={(d) => d.deliveryDate}
              columns={[
                {
                  key: 'date',
                  header: 'Delivery',
                  rowHeader: true,
                  cell: (d) => (
                    <Link to={`/briefing/${d.deliveryDate}?gc=${gc}`}>
                      {formatDateShort(d.deliveryDate)}
                    </Link>
                  ),
                },
                { key: 'rm', header: 'MAE raw', cell: (d) => formatMw(d.rawMaeMw) },
                {
                  key: 'cm',
                  header: 'MAE cal',
                  cell: (d) => (d.calibratedMaeMw !== null ? formatMw(d.calibratedMaeMw) : '–'),
                },
                { key: 'rb', header: 'Bias raw', cell: (d) => formatSignedMw(d.rawBiasMw) },
                {
                  key: 'cb',
                  header: 'Bias cal',
                  cell: (d) =>
                    d.calibratedBiasMw !== null ? formatSignedMw(d.calibratedBiasMw) : '–',
                },
                { key: 'fe', header: 'Fcst GWh', cell: (d) => formatGw(d.forecastEnergyMwh) },
                { key: 'ae', header: 'Outturn GWh', cell: (d) => formatGw(d.actualEnergyMwh) },
              ]}
            />
          }
        >
          <DailyChart data={report.daily} gateClosure={gc} />
        </Panel>

        <Panel
          title="Error by lead time"
          sub="NESO forecast, latest run published at least N hours ahead"
          refreshing={refreshing}
          actions={<SeriesKey id="raw" label="Mean abs. error" />}
          note={findings.lead}
          table={
            <DataTable
              caption="Accuracy of the NESO forecast by minimum lead time (MW)"
              rows={report.byLead}
              rowKey={(d) => String(d.leadHours)}
              columns={[
                { key: 'lead', header: 'Lead ≥', rowHeader: true, cell: (d) => `${d.leadHours} h` },
                { key: 'n', header: 'Hours', cell: (d) => d.count },
                { key: 'mae', header: 'MAE', cell: (d) => formatMw(d.maeMw) },
                { key: 'bias', header: 'Bias', cell: (d) => formatSignedMw(d.biasMw) },
                { key: 'p90', header: 'P90 abs', cell: (d) => formatMw(d.p90AbsErrorMw) },
              ]}
            />
          }
        >
          <LeadChart
            data={report.byLead}
            decisionMin={report.decisionLeadHoursMin}
            decisionMax={report.decisionLeadHoursMax}
          />
        </Panel>

        <Panel
          title="Bias by forecast level"
          sub="Average forecast − outturn, grouped by NESO forecast (GW)"
          refreshing={refreshing}
          actions={
            <div className="keys">
              <BarKey id="raw" />
              <BarKey id="calibrated" />
            </div>
          }
          note={findings.level}
          table={
            <DataTable
              caption="Bias and error by forecast level (MW)"
              rows={report.byLevel}
              rowKey={(d) => String(d.lowerMw)}
              columns={[
                { key: 'bin', header: 'Forecast GW', rowHeader: true, cell: levelLabel },
                { key: 'n', header: 'Hours', cell: (d) => d.count },
                { key: 'rb', header: 'Bias raw', cell: (d) => formatSignedMw(d.rawBiasMw) },
                {
                  key: 'cb',
                  header: 'Bias cal',
                  cell: (d) =>
                    d.calibratedBiasMw !== null ? formatSignedMw(d.calibratedBiasMw) : '–',
                },
                { key: 'rm', header: 'MAE raw', cell: (d) => formatMw(d.rawMaeMw) },
                {
                  key: 'cm',
                  header: 'MAE cal',
                  cell: (d) => (d.calibratedMaeMw !== null ? formatMw(d.calibratedMaeMw) : '–'),
                },
              ]}
            />
          }
        >
          <LevelChart data={report.byLevel} />
        </Panel>

        <Panel
          title="Error distribution"
          sub={`Hours per ${formatMw(report.histogramBinWidthMw)} MW error bin · forecast − outturn`}
          refreshing={refreshing}
          actions={
            <div className="keys">
              <BarKey id="raw" />
              <BarKey id="calibrated" />
            </div>
          }
          note={findings.bias}
          table={
            <DataTable
              caption="Error distribution (hours per bin)"
              rows={report.histogram}
              rowKey={(d) => String(d.lowerMw)}
              columns={[
                {
                  key: 'bin',
                  header: 'Error MW',
                  rowHeader: true,
                  cell: (d) => `${formatSignedMw(d.lowerMw)} to ${formatSignedMw(d.upperMw)}`,
                },
                { key: 'r', header: 'Raw', cell: (d) => d.rawCount },
                { key: 'c', header: 'Calibrated', cell: (d) => d.calibratedCount },
              ]}
            />
          }
        >
          <HistogramChart data={report.histogram} binWidth={report.histogramBinWidthMw} />
        </Panel>

        <Panel
          title="Error by hour of day"
          sub="Mean absolute error by UK clock hour"
          refreshing={refreshing}
          actions={
            <div className="keys">
              <SeriesKey id="raw" />
              <SeriesKey id="calibrated" />
            </div>
          }
          note={findings.hour}
          table={
            <DataTable
              caption="Accuracy by UK hour of day (MW)"
              rows={report.byHour}
              rowKey={(d) => String(d.hour)}
              columns={[
                {
                  key: 'h',
                  header: 'Hour',
                  rowHeader: true,
                  cell: (d) => `${String(d.hour).padStart(2, '0')}:00`,
                },
                { key: 'n', header: 'Hours', cell: (d) => d.count },
                { key: 'rm', header: 'MAE raw', cell: (d) => formatMw(d.rawMaeMw) },
                {
                  key: 'cm',
                  header: 'MAE cal',
                  cell: (d) => (d.calibratedMaeMw !== null ? formatMw(d.calibratedMaeMw) : '–'),
                },
                { key: 'rb', header: 'Bias raw', cell: (d) => formatSignedMw(d.rawBiasMw) },
              ]}
            />
          }
        >
          <HourChart data={report.byHour} />
        </Panel>

        <Panel
          title="Forecast vs outturn"
          sub="x: forecast · y: outturn (MW) · diagonal = perfect forecast"
          refreshing={refreshing}
          actions={
            <div className="keys">
              <BarKey id="raw" />
              <BarKey id="calibrated" />
            </div>
          }
          note="Points below the diagonal are over-forecasts. The NESO cloud bends away from the diagonal at high wind; the calibrated cloud straddles it."
          table={
            <DataTable
              caption="Every hourly product (MW)"
              rows={report.scatter}
              rowKey={(d) => d.startTime}
              columns={[
                {
                  key: 't',
                  header: 'Hour',
                  rowHeader: true,
                  cell: (d) =>
                    `${formatDateShort(deliveryDateOf(d.startTime))} ${formatUkTime(d.startTime)}`,
                },
                { key: 'f', header: 'Raw', cell: (d) => formatMw(d.forecastMw) },
                {
                  key: 'c',
                  header: 'Calibrated',
                  cell: (d) => (d.calibratedMw !== null ? formatMw(d.calibratedMw) : '–'),
                },
                { key: 'a', header: 'Outturn', cell: (d) => formatMw(d.actualMw) },
              ]}
            />
          }
        >
          <ScatterPlot data={report.scatter} />
        </Panel>
      </div>

      <Panel
        title="Largest misses"
        sub="Hours with the biggest NESO forecast error · open the day"
        refreshing={refreshing}
        flush
      >
        <DataTable
          caption="Largest absolute errors of the NESO forecast (MW)"
          scroll={false}
          rows={misses}
          rowKey={(d) => d.startTime}
          columns={[
            {
              key: 'd',
              header: 'Delivery',
              rowHeader: true,
              cell: (d) => (
                <Link to={`/briefing/${deliveryDateOf(d.startTime)}?gc=${gc}`}>
                  {formatDateShort(deliveryDateOf(d.startTime))} {formatUkTime(d.startTime)}
                  <ArrowUpRight size={12} className="link-icon" />
                </Link>
              ),
            },
            { key: 'f', header: 'Raw', cell: (d) => formatMw(d.forecastMw) },
            {
              key: 'c',
              header: 'Calibrated',
              cell: (d) => (d.calibratedMw !== null ? formatMw(d.calibratedMw) : '–'),
            },
            { key: 'a', header: 'Outturn', cell: (d) => formatMw(d.actualMw) },
            {
              key: 'e',
              header: 'Err raw',
              cell: (d) => formatSignedMw(d.forecastMw - d.actualMw),
            },
            {
              key: 'k',
              header: 'Err cal',
              cell: (d) =>
                d.calibratedMw !== null ? formatSignedMw(d.calibratedMw - d.actualMw) : '–',
            },
          ]}
        />
      </Panel>
    </>
  )
}

interface HeadlineRow {
  key: string
  label: string
  raw: string
  calibrated: string
  change: string
}

function relativeChange(raw: number, calibrated: number): string {
  return raw === 0 ? '–' : formatSignedPct((calibrated / raw - 1) * 100)
}

/** One dense comparison, NESO forecast against calibrated, in the blotter's grammar. */
function HeadlineTable({ report }: { report: Accuracy }) {
  const raw = report.metrics.raw as ErrorMetrics
  const cal = report.metrics.calibrated
  const mw = (
    key: string,
    label: string,
    pick: (m: ErrorMetrics) => number,
    signed = false,
  ): HeadlineRow => {
    const fmt = signed ? formatSignedMw : formatMw
    return {
      key,
      label,
      raw: fmt(pick(raw)),
      calibrated: cal ? fmt(pick(cal)) : '–',
      change: cal
        ? signed
          ? `${formatSignedMw(pick(cal) - pick(raw))} MW`
          : relativeChange(pick(raw), pick(cal))
        : '–',
    }
  }

  const rows: HeadlineRow[] = [
    mw('mae', 'Mean absolute error, MW', (m) => m.maeMw),
    mw('rmse', 'Root-mean-square error, MW', (m) => m.rmseMw),
    mw('bias', 'Bias, MW', (m) => m.biasMw, true),
    mw('median', 'Median absolute error, MW', (m) => m.medianAbsErrorMw),
    mw('p90', 'P90 absolute error, MW', (m) => m.p90AbsErrorMw),
    mw('p99', 'P99 absolute error, MW', (m) => m.p99AbsErrorMw),
    mw('over', 'Largest over-forecast, MW', (m) => m.maxOverForecastMw),
    mw('under', 'Largest under-forecast, MW', (m) => m.maxUnderForecastMw),
    {
      key: 'wape',
      label: 'Error as share of energy (WAPE)',
      raw: raw.wapePct !== null ? formatPct(raw.wapePct) : '–',
      calibrated: cal?.wapePct != null ? formatPct(cal.wapePct) : '–',
      change:
        raw.wapePct !== null && cal?.wapePct != null
          ? `${formatSignedPct(cal.wapePct - raw.wapePct)} pts`
          : '–',
    },
  ]
  if (report.energy) {
    const { forecastGwh, calibratedGwh, actualGwh } = report.energy
    rows.push({
      key: 'energy',
      label: `Energy vs outturn (${formatMw(actualGwh)} GWh)`,
      raw: formatSignedPct((forecastGwh / actualGwh - 1) * 100),
      calibrated:
        calibratedGwh !== null ? formatSignedPct((calibratedGwh / actualGwh - 1) * 100) : '–',
      change: '–',
    })
  }
  if (report.band) {
    rows.push({
      key: 'band',
      label: `Outturn inside 80% range (target ${formatPct(report.band.targetCoverage * 100, 0)})`,
      raw: '–',
      calibrated: formatPct(report.band.observedCoverage * 100),
      change: '–',
    })
  }

  return (
    <div className="table-wrap">
      <table className="table headline">
        <caption className="visually-hidden">
          Accuracy of the NESO forecast and the calibrated forecast over the pilot
        </caption>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">
              <LineKey color={SERIES.raw.color} />
              NESO
            </th>
            <th scope="col">
              <LineKey color={SERIES.calibrated.color} />
              Calibrated
            </th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.key === 'mae' ? 'is-lead' : undefined}>
              <th scope="row">{row.label}</th>
              <td>{row.raw}</td>
              <td className="num-strong">{row.calibrated}</td>
              <td className="muted">{row.change}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function marginText(value: number): string {
  return value <= 0 ? 'none' : formatMw(value)
}

function useLargestMisses(points: ScatterPoint[], count: number): ScatterPoint[] {
  return useMemo(
    () =>
      points
        .toSorted(
          (a, b) => Math.abs(b.forecastMw - b.actualMw) - Math.abs(a.forecastMw - a.actualMw),
        )
        .slice(0, count),
    [points, count],
  )
}

interface Findings {
  bias?: string
  level?: string
  calibration?: string
  lead?: string
  hour?: string
}

/** Plain-language findings, computed from the report so they always match the data. */
function useFindings(report: Accuracy): Findings {
  return useMemo(() => {
    const findings: Findings = {}
    const { metrics, energy, band, byLevel, byLead, byHour } = report
    const raw = metrics.raw
    const cal = metrics.calibrated

    if (raw && energy) {
      const overPct = ((energy.forecastGwh - energy.actualGwh) / energy.actualGwh) * 100
      findings.bias = `Most hours were over-forecast: the NESO forecast ran ${formatGw(raw.biasMw)} GW above outturn on average, ${formatPct(overPct)} more energy than arrived. Calibration re-centres the distribution on zero.`
    }

    const robust = byLevel.filter((bin) => bin.count >= 20)
    const top = robust.at(-1)
    const bottom = robust[0]
    if (top && bottom && top.rawBiasMw > bottom.rawBiasMw) {
      findings.level = `The shortfall grows with the wind: at ${levelLabel(top)} GW forecast, outturn came in ${formatGw(top.rawBiasMw)} GW lower on average, against ${formatGw(bottom.rawBiasMw)} GW at ${levelLabel(bottom)} GW, a pattern consistent with high-wind curtailment. That is why the calibration scales the forecast rather than shifting it.`
    }

    if (raw && cal && report.maeReductionPct !== null) {
      findings.calibration = `Calibrating each day on the previous 14 settled days cut mean absolute error from ${formatMw(raw.maeMw)} to ${formatMw(cal.maeMw)} MW (${formatSignedPct(-report.maeReductionPct)}) with no hindsight${band ? `; its 80% range held the outturn ${formatPct(band.observedCoverage * 100)} of the time` : ''}.`
    }

    const atZero = byLead.find((b) => b.leadHours === 0)
    const atDayAhead = byLead.find((b) => b.leadHours === 24)
    if (atZero && atDayAhead && atDayAhead.maeMw > atZero.maeMw) {
      findings.lead = `Forecasts sharpen as delivery approaches: ${formatMw(atDayAhead.maeMw)} MW mean error a day ahead against ${formatMw(atZero.maeMw)} MW with the latest run (${formatSignedPct((atZero.maeMw / atDayAhead.maeMw - 1) * 100)}). Intraday re-trading can recover part of the day-ahead error. The shaded band marks day-ahead decision lead times.`
    }

    const worst = byHour.toSorted((a, b) => b.rawMaeMw - a.rawMaeMw)[0]
    if (worst) {
      const everyHour = byHour.every(
        (h) => h.calibratedMaeMw !== null && h.calibratedMaeMw < h.rawMaeMw,
      )
      findings.hour = `The NESO forecast is least accurate around ${String(worst.hour).padStart(2, '0')}:00 UK (${formatMw(worst.rawMaeMw)} MW).${everyHour ? ' Calibration lowers the error in every hour of the day.' : ''}`
    }
    return findings
  }, [report])
}
