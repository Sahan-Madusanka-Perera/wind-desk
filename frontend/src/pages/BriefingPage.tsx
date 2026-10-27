import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { useAccuracy, useBriefing, useMeta } from '../api/queries'
import type { Briefing, Meta } from '../api/types'
import { Blotter } from '../components/Blotter'
import { EvolutionChart } from '../components/charts/EvolutionChart'
import { ForecastChart } from '../components/charts/ForecastChart'
import { DayRail, type RailDay } from '../components/DayRail'
import { GateClosureControl } from '../components/GateClosureControl'
import { ChevronLeft, ChevronRight } from '../components/Icons'
import { Panel } from '../components/Panel'
import { Quotes, type QuoteItem } from '../components/Quotes'
import { BandKey, LineKey, SeriesKey } from '../components/SeriesKey'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { addDays, dateRange, isIsoDate } from '../lib/dates'
import {
  formatDateLong,
  formatDateShort,
  formatDuration,
  formatGwh,
  formatHours,
  formatMw,
  formatSignedGw,
  formatSignedMw,
  formatUkDayTime,
  formatUkTime,
  minutesBetween,
} from '../lib/format'
import { SERIES } from '../lib/series'
import { useGateClosure } from '../lib/useGateClosure'
import { useHotkeys } from '../lib/useHotkeys'

export function BriefingPage() {
  const meta = useMeta()
  if (meta.isPending) return <LoadingState label="Loading WindDesk" />
  if (meta.isError) return <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
  return <BriefingView meta={meta.data} />
}

function BriefingView({ meta }: { meta: Meta }) {
  const params = useParams()
  const navigate = useNavigate()
  const [gateClosure, setGateClosure] = useGateClosure(meta)
  const [showActual, setShowActual] = useState(true)

  const requested = params.date
  const deliveryDate = requested ?? meta.lastDeliveryDate
  const inScope =
    isIsoDate(deliveryDate) &&
    deliveryDate >= meta.firstDeliveryDate &&
    deliveryDate <= meta.lastDeliveryDate

  const briefing = useBriefing(inScope ? deliveryDate : undefined, gateClosure)
  const accuracy = useAccuracy(gateClosure)

  const go = (date: string) => {
    const search =
      gateClosure && gateClosure !== meta.defaultGateClosure ? `?gc=${gateClosure}` : ''
    navigate(`/briefing/${date}${search}`)
  }
  const canPrev = inScope && deliveryDate > meta.firstDeliveryDate
  const canNext = inScope && deliveryDate < meta.lastDeliveryDate

  useHotkeys({
    ArrowLeft: () => canPrev && go(addDays(deliveryDate, -1)),
    ArrowRight: () => canNext && go(addDays(deliveryDate, 1)),
    o: () => setShowActual((value) => !value),
  })

  const railDays: RailDay[] = useMemo(() => {
    const energy = new Map(accuracy.data?.daily.map((d) => [d.deliveryDate, d.forecastEnergyMwh]))
    return dateRange(meta.firstDeliveryDate, meta.lastDeliveryDate).map((date) => ({
      date,
      forecastEnergyMwh: energy.get(date) ?? null,
    }))
  }, [accuracy.data, meta.firstDeliveryDate, meta.lastDeliveryDate])

  if (!inScope) {
    return (
      <EmptyState
        title="That delivery day is outside the pilot"
        text={`The pilot covers purchase decisions taken ${formatDateLong(meta.firstDecisionDate)} to ${formatDateLong(meta.lastDecisionDate)}, i.e. delivery ${formatDateLong(meta.firstDeliveryDate)} to ${formatDateLong(meta.lastDeliveryDate)}.`}
      />
    )
  }

  const data = briefing.data
  const decisionDate = addDays(deliveryDate, -1)

  return (
    <>
      <h1 className="visually-hidden">
        Day-ahead briefing for delivery {formatDateLong(deliveryDate)}
      </h1>
      <div className="cmdbar">
        <div className="cmd-group">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => go(addDays(deliveryDate, -1))}
            disabled={!canPrev}
            aria-label="Previous delivery day"
            title="Previous delivery day (←)"
          >
            <ChevronLeft />
          </button>
          <div>
            <div className="cmd-label">Delivery day</div>
            <div className="cmd-title">{formatDateLong(deliveryDate)}</div>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => go(addDays(deliveryDate, 1))}
            disabled={!canNext}
            aria-label="Next delivery day"
            title="Next delivery day (→)"
          >
            <ChevronRight />
          </button>
        </div>
        <div className="cmd-meta">
          Auction <strong>{formatDateShort(decisionDate)}</strong> · decide by{' '}
          <strong>{gateClosure} UK</strong>
          <br />
          Delivers 23:00 {formatDateShort(decisionDate)} → 23:00 {formatDateShort(deliveryDate)}
        </div>
        <div className="cmd-spacer" />
        {gateClosure ? (
          <GateClosureControl
            value={gateClosure}
            presets={meta.gateClosurePresets}
            onChange={setGateClosure}
          />
        ) : null}
        <label className="toggle" title="Show or hide metered outturn (O)">
          <input
            type="checkbox"
            checked={showActual}
            onChange={(event) => setShowActual(event.target.checked)}
          />
          Show outturn <kbd aria-hidden="true">O</kbd>
        </label>
      </div>

      <section className="railbar" aria-label="Delivery days">
        <div className="railbar-label" aria-hidden="true">
          <span className="cmd-label">Delivery day</span>
          <span className="railbar-hint">bar: forecast GWh</span>
        </div>
        <DayRail days={railDays} selected={deliveryDate} onSelect={go} />
      </section>

      {briefing.isPending ? (
        <LoadingState label="Loading briefing" />
      ) : briefing.isError ? (
        <ErrorState error={briefing.error} onRetry={() => void briefing.refetch()} />
      ) : data ? (
        <BriefingBody
          briefing={data}
          meta={meta}
          showActual={showActual}
          refreshing={briefing.isPlaceholderData}
        />
      ) : null}
    </>
  )
}

function BriefingBody({
  briefing,
  meta,
  showActual,
  refreshing,
}: {
  briefing: Briefing
  meta: Meta
  showActual: boolean
  refreshing: boolean
}) {
  const { summary, calibration, metrics } = briefing
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const runLead =
    briefing.forecastPublishTime !== null
      ? minutesBetween(briefing.forecastPublishTime, briefing.decisionCutoff)
      : null
  const inRange = briefing.points.filter(
    (p) =>
      p.actualMw !== null &&
      p.lowerMw !== null &&
      p.upperMw !== null &&
      p.actualMw >= p.lowerMw &&
      p.actualMw <= p.upperMw,
  ).length
  const scored = briefing.points.filter((p) => p.actualMw !== null && p.lowerMw !== null).length

  if (!summary) {
    return (
      <EmptyState
        title="No forecast was available at this gate closure"
        text="No WINDFOR run covering this delivery day had been published by the selected decision time. Try a later gate closure."
      />
    )
  }

  const quotes: QuoteItem[] = [
    {
      id: 'expected',
      primary: true,
      label: (
        <>
          <LineKey color={SERIES.calibrated.color} /> Expected wind
        </>
      ),
      value: summary.calibratedEnergyMwh !== null ? formatGwh(summary.calibratedEnergyMwh) : '–',
      unit: 'GWh',
      sub: 'Calibrated, whole day',
    },
    {
      id: 'firm',
      label: 'Firm at 90%',
      value: summary.dependableEnergyMwh !== null ? formatGwh(summary.dependableEnergyMwh) : '–',
      unit: 'GWh',
      sub: 'Lower edge of 80% range',
    },
    {
      id: 'raw',
      label: (
        <>
          <LineKey color={SERIES.raw.color} /> NESO forecast
        </>
      ),
      value: summary.forecastEnergyMwh !== null ? formatGwh(summary.forecastEnergyMwh) : '–',
      unit: 'GWh',
      sub:
        summary.forecastEnergyMwh !== null && summary.calibratedEnergyMwh !== null
          ? `${formatSignedGw(summary.forecastEnergyMwh - summary.calibratedEnergyMwh)} GWh vs calibrated`
          : `Mean ${formatMw(summary.forecastMeanMw)} MW`,
    },
    {
      id: 'run',
      label: 'Run used',
      value: briefing.forecastPublishTime ? formatUkTime(briefing.forecastPublishTime) : '–',
      unit: 'UK',
      sub:
        runLead !== null
          ? `${formatDuration(runLead)} before gate closure`
          : 'No run before gate closure',
    },
  ]
  if (showActual) {
    quotes.push({
      id: 'actual',
      label: (
        <>
          <LineKey color={SERIES.actual.color} /> Outturn
        </>
      ),
      value: summary.actualEnergyMwh !== null ? formatGwh(summary.actualEnergyMwh) : '–',
      unit: 'GWh',
      sub: scored > 0 ? `After delivery · ${inRange}/${scored} h in range` : 'Known after delivery',
    })
  }

  return (
    <>
      <Quotes items={quotes} label="Delivery day summary" />

      <div className="briefing-grid">
        <div className="stack">
          <Panel
            title="Forecast vs outturn"
            sub={`MW · hourly products · ${formatUkTime(briefing.window.start)} ${formatDateShort(briefing.decisionDate)} → ${formatUkTime(briefing.window.end)} ${formatDateShort(briefing.deliveryDate)} UK`}
            refreshing={refreshing}
            actions={
              <div className="keys">
                <SeriesKey id="raw" />
                {calibration ? <SeriesKey id="calibrated" /> : null}
                {calibration ? <BandKey coverage={calibration.coverage} /> : null}
                {showActual ? <SeriesKey id="actual" /> : null}
              </div>
            }
          >
            <ForecastChart
              points={briefing.points}
              actuals={briefing.actuals}
              start={briefing.window.start}
              end={briefing.window.end}
              showActual={showActual}
              height={300}
              highlight={hoverTime}
              onHover={setHoverTime}
              label={`Forecast available at ${briefing.gateClosure} on ${briefing.decisionDate} versus outturn for delivery ${briefing.deliveryDate}`}
            />
          </Panel>

          <Panel title="Decision record" refreshing={refreshing}>
            <dl className="facts">
              <dt>Decision</dt>
              <dd>
                {formatUkDayTime(briefing.decisionCutoff)} UK{' '}
                <span className="muted">
                  (
                  {meta.gateClosurePresets.find((p) => p.time === briefing.gateClosure)?.label ??
                    'custom decision time'}
                  )
                </span>
              </dd>
              <dt>Run used</dt>
              <dd>
                {briefing.forecastPublishTime
                  ? `${formatUkDayTime(briefing.forecastPublishTime)} UK`
                  : 'None'}{' '}
                <span className="muted nowrap">
                  lead {briefing.leadHoursMin !== null ? formatHours(briefing.leadHoursMin) : '–'}–
                  {briefing.leadHoursMax !== null ? formatHours(briefing.leadHoursMax) : '–'}
                </span>
              </dd>
              <dt>Next run</dt>
              <dd>
                {briefing.nextPublishTime
                  ? `${formatUkDayTime(briefing.nextPublishTime)} UK`
                  : 'None'}{' '}
                <span className="muted">after gate closure, not usable</span>
              </dd>
              <dt>Calibration</dt>
              <dd>
                {calibration ? (
                  <>
                    outturn ≈ {calibration.slope.toFixed(3)} × forecast{' '}
                    {calibration.interceptMw >= 0 ? '+' : '−'}{' '}
                    {formatMw(Math.abs(calibration.interceptMw))} MW{' '}
                    <span className="muted">
                      · trained {formatDateShort(calibration.trainingFrom)} –{' '}
                      {formatDateShort(calibration.trainingTo)} ({calibration.trainingDays} settled
                      days, {calibration.trainingPoints} h)
                    </span>
                  </>
                ) : (
                  <span className="muted">Not enough settled history before this decision</span>
                )}
              </dd>
              {calibration ? (
                <>
                  <dt>80% range</dt>
                  <dd>
                    {formatSignedMw(calibration.residualLowerMw)} /{' '}
                    {formatSignedMw(calibration.residualUpperMw)} MW around the calibrated value
                  </dd>
                </>
              ) : null}
              {showActual && metrics.raw ? (
                <>
                  <dt>Day result</dt>
                  <dd>
                    MAE {formatMw(metrics.raw.maeMw)} MW raw
                    {metrics.calibrated
                      ? ` → ${formatMw(metrics.calibrated.maeMw)} MW calibrated`
                      : ''}{' '}
                    <span className="muted">
                      · bias raw {formatSignedMw(metrics.raw.biasMw)} MW
                    </span>
                  </dd>
                </>
              ) : null}
            </dl>
          </Panel>
        </div>

        <Panel
          title="Hourly blotter"
          sub={`${briefing.points.length}/${briefing.expectedPoints} hourly products · MW`}
          refreshing={refreshing}
          flush
          note={
            <>
              Error = forecast − outturn: positive means less wind than forecast (the desk is
              short). See the <Link to="/methodology">methodology</Link> for definitions.
            </>
          }
        >
          <Blotter
            briefing={briefing}
            showActual={showActual}
            activeTime={hoverTime}
            onHover={setHoverTime}
          />
        </Panel>
      </div>

      <Panel
        title="Forecast evolution"
        sub={`${briefing.vintages.length} runs from the 24 h before gate closure to the start of delivery`}
        refreshing={refreshing}
        actions={
          <div className="keys">
            <span className="key">
              <LineKey color={SERIES.raw.color} />
              Run used
            </span>
            <span className="key">
              <LineKey color="var(--ink-2)" dashed />
              After gate closure
            </span>
            {showActual ? <SeriesKey id="actual" /> : null}
          </div>
        }
        note="Faint solid lines are earlier runs the desk could also see. Dashed runs were published after gate closure: they show what the desk could not have known."
      >
        <EvolutionChart
          vintages={briefing.vintages}
          actuals={briefing.actuals}
          start={briefing.window.start}
          end={briefing.window.end}
          showActual={showActual}
          height={240}
          label="Successive WINDFOR forecast runs for this delivery day"
        />
      </Panel>
    </>
  )
}
