import { useState } from 'react'

import type { Briefing, ForecastPoint } from '../api/types'
import {
  formatAxisMw,
  formatGwh,
  formatHours,
  formatMw,
  formatSignedMw,
  formatUkTime,
  ukDateHour,
} from '../lib/format'
import { BAND_FILL, SERIES } from '../lib/series'
import { CheckIcon, CrossIcon } from './Icons'
import { LineKey, SwatchKey } from './SeriesKey'

const STEP_MW = 1000

function rangeDomain(points: ForecastPoint[], showActual: boolean): [number, number] {
  const values = points.flatMap((p) => [
    p.forecastMw,
    ...(p.lowerMw !== null ? [p.lowerMw] : []),
    ...(p.upperMw !== null ? [p.upperMw] : []),
    ...(showActual && p.actualMw !== null ? [p.actualMw] : []),
  ])
  if (values.length === 0) return [0, 1]
  const lo = Math.max(0, Math.floor(Math.min(...values) / STEP_MW) * STEP_MW)
  const hi = Math.ceil(Math.max(...values) / STEP_MW) * STEP_MW
  return [lo, hi > lo ? hi : lo + STEP_MW]
}

function inRange(p: ForecastPoint): boolean | null {
  if (p.actualMw === null || p.lowerMw === null || p.upperMw === null) return null
  return p.actualMw >= p.lowerMw && p.actualMw <= p.upperMw
}

/**
 * Remembers the previous set of points so that, like a trading screen, only values
 * that actually changed (new day, new gate closure) flash. Nothing flashes on load.
 */
function usePreviousPoints(points: ForecastPoint[]): ForecastPoint[] | null {
  const [history, setHistory] = useState<{
    current: ForecastPoint[]
    previous: ForecastPoint[] | null
  }>({ current: points, previous: null })
  if (history.current !== points) {
    setHistory({ current: points, previous: history.current })
    return history.current
  }
  return history.previous
}

/**
 * One row per hourly day-ahead product, as the desk would quote it: the run the trader
 * saw, the calibrated view with its range drawn inline, and (once known) the outturn.
 */
export function Blotter({
  briefing,
  showActual,
  activeTime = null,
  onHover,
}: {
  briefing: Briefing
  showActual: boolean
  activeTime?: number | null
  onHover?: (time: number | null) => void
}) {
  const { points, summary } = briefing
  const previous = usePreviousPoints(points)
  const [lo, hi] = rangeDomain(points, showActual)
  const span = hi - lo
  const pct = (value: number) => `${Math.min(100, Math.max(0, ((value - lo) / span) * 100))}%`

  const peakTime = summary?.forecastPeakTime
  const hasCalibration = points.some((p) => p.calibratedMw !== null)
  const hits = points.map(inRange).filter((hit): hit is boolean => hit !== null)
  const hitCount = hits.filter(Boolean).length

  return (
    <div className="table-wrap">
      {/* Hover only mirrors the hour onto the chart; every value is in the table itself. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <table className="table blotter" onMouseLeave={() => onHover?.(null)}>
        <caption className="visually-hidden">
          Hourly day-ahead products for delivery {briefing.deliveryDate}: forecast available at gate
          closure, calibrated forecast with its range, and outturn
        </caption>
        <thead>
          <tr>
            <th scope="col">Hour UK</th>
            <th scope="col" className="col-optional col-wide">
              Lead
            </th>
            <th scope="col">
              <LineKey color={SERIES.raw.color} />
              Raw
            </th>
            {hasCalibration ? (
              <>
                <th scope="col">
                  <LineKey color={SERIES.calibrated.color} />
                  Calibrated
                </th>
                <th scope="col">80% range</th>
              </>
            ) : null}
            <th scope="col" className="col-range col-optional">
              <span className="key">
                <SwatchKey color={BAND_FILL} />
                {formatAxisMw(lo)}–{formatAxisMw(hi)} MW
              </span>
            </th>
            {showActual ? (
              <>
                <th scope="col">
                  <LineKey color={SERIES.actual.color} />
                  Outturn
                </th>
                <th scope="col">Err raw</th>
                {hasCalibration ? <th scope="col">Err cal</th> : null}
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {points.map((p, index) => {
            const time = Date.parse(p.startTime)
            const { hour, date } = ukDateHour(p.startTime)
            const before = previous?.[index]
            const rawChanged = before !== undefined && before.forecastMw !== p.forecastMw
            const calChanged = before !== undefined && before.calibratedMw !== p.calibratedMw
            const hit = inRange(p)
            const classes = [
              p.startTime === peakTime ? 'is-peak' : '',
              time === activeTime ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <tr key={index} className={classes || undefined} onMouseEnter={() => onHover?.(time)}>
                <th scope="row" className="blotter-hour">
                  {formatUkTime(p.startTime)}
                  {date < briefing.deliveryDate && hour === 23 ? (
                    <span className="blotter-dminus">D-1</span>
                  ) : null}
                </th>
                <td className="muted col-optional col-wide">{formatHours(p.leadHours)}</td>
                <td key={`raw-${p.forecastMw}`} className={rawChanged ? 'cell-flash' : undefined}>
                  {formatMw(p.forecastMw)}
                </td>
                {hasCalibration ? (
                  <>
                    <td
                      key={`cal-${p.calibratedMw}`}
                      className={calChanged ? 'cell-flash num-strong' : 'num-strong'}
                    >
                      {p.calibratedMw !== null ? formatMw(p.calibratedMw) : '–'}
                    </td>
                    <td className="muted nowrap">
                      {p.lowerMw !== null && p.upperMw !== null
                        ? `${formatMw(p.lowerMw)}–${formatMw(p.upperMw)}`
                        : '–'}
                    </td>
                  </>
                ) : null}
                <td className="col-range col-optional">
                  <div className="rangebar" aria-hidden="true">
                    {p.lowerMw !== null && p.upperMw !== null ? (
                      <span
                        className="rangebar-band"
                        style={{ left: pct(p.lowerMw), right: `calc(100% - ${pct(p.upperMw)})` }}
                      />
                    ) : null}
                    <span
                      className="rangebar-tick"
                      style={{ left: pct(p.forecastMw), background: SERIES.raw.color }}
                    />
                    {p.calibratedMw !== null ? (
                      <span
                        className="rangebar-tick"
                        style={{ left: pct(p.calibratedMw), background: SERIES.calibrated.color }}
                      />
                    ) : null}
                    {showActual && p.actualMw !== null ? (
                      <span
                        className="rangebar-dot"
                        style={{ left: pct(p.actualMw), background: SERIES.actual.color }}
                      />
                    ) : null}
                  </div>
                </td>
                {showActual ? (
                  <>
                    <td>{p.actualMw !== null ? formatMw(p.actualMw) : '–'}</td>
                    <td>{p.actualMw !== null ? formatSignedMw(p.forecastMw - p.actualMw) : '–'}</td>
                    {hasCalibration ? (
                      <td>
                        {p.actualMw !== null && p.calibratedMw !== null ? (
                          <span className="hit">
                            {formatSignedMw(p.calibratedMw - p.actualMw)}
                            {hit === null ? null : hit ? (
                              <span className="hit-in" title="Outturn inside the 80% range">
                                <CheckIcon size={13} />
                                <span className="visually-hidden">inside range</span>
                              </span>
                            ) : (
                              <span className="hit-out" title="Outturn outside the 80% range">
                                <CrossIcon size={13} />
                                <span className="visually-hidden">outside range</span>
                              </span>
                            )}
                          </span>
                        ) : (
                          '–'
                        )}
                      </td>
                    ) : null}
                  </>
                ) : null}
              </tr>
            )
          })}
        </tbody>
        {summary ? (
          <tfoot>
            <tr>
              <th scope="row">Day GWh</th>
              <td className="muted col-optional col-wide nowrap">
                {briefing.leadHoursMin !== null && briefing.leadHoursMax !== null
                  ? `${briefing.leadHoursMin}–${briefing.leadHoursMax} h`
                  : '–'}
              </td>
              <td>
                {summary.forecastEnergyMwh !== null ? formatGwh(summary.forecastEnergyMwh) : '–'}
              </td>
              {hasCalibration ? (
                <>
                  <td>
                    {summary.calibratedEnergyMwh !== null
                      ? formatGwh(summary.calibratedEnergyMwh)
                      : '–'}
                  </td>
                  <td>
                    {summary.dependableEnergyMwh !== null
                      ? `≥ ${formatGwh(summary.dependableEnergyMwh)}`
                      : '–'}
                  </td>
                </>
              ) : null}
              <td className="col-range col-optional muted" style={{ textAlign: 'left' }}>
                {showActual && hits.length > 0 ? `${hitCount}/${hits.length} h in range` : '–'}
              </td>
              {showActual ? (
                <>
                  <td>
                    {summary.actualEnergyMwh !== null ? formatGwh(summary.actualEnergyMwh) : '–'}
                  </td>
                  <td className="muted">
                    {briefing.metrics.raw ? `MAE ${formatMw(briefing.metrics.raw.maeMw)}` : '–'}
                  </td>
                  {hasCalibration ? (
                    <td className="muted">
                      {briefing.metrics.calibrated
                        ? `MAE ${formatMw(briefing.metrics.calibrated.maeMw)}`
                        : '–'}
                    </td>
                  ) : null}
                </>
              ) : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}
