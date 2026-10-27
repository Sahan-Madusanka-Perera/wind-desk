import { Link } from 'react-router'

import { useMeta } from '../api/queries'
import { ErrorState, LoadingState } from '../components/StateViews'
import { formatDateLong, formatUkDayTime } from '../lib/format'

const SECTIONS = [
  { id: 'questions', title: 'What WindDesk answers' },
  { id: 'data', title: 'Data' },
  { id: 'scope', title: 'Pilot scope' },
  { id: 'market', title: 'Market conventions' },
  { id: 'decision', title: 'The decision forecast' },
  { id: 'matching', title: 'Matching forecast to outturn' },
  { id: 'metrics', title: 'Error metrics' },
  { id: 'calibration', title: 'Calibration and range' },
  { id: 'lead', title: 'Lead-time analysis' },
  { id: 'limits', title: 'Limitations and next steps' },
] as const

export function MethodologyPage() {
  const meta = useMeta()
  if (meta.isPending) return <LoadingState label="Loading methodology" />
  if (meta.isError) return <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
  const m = meta.data

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Methodology</h1>
        <p className="page-lede">
          Every number in WindDesk is defined here, with the data it comes from and the assumptions
          behind it.
        </p>
      </div>

      <div className="method-layout">
        <nav className="toc" aria-label="On this page">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>

        <article className="prose">
          <h2 id="questions">What WindDesk answers</h2>
          <p>
            The day-ahead desk buys power for each delivery day before the auction closes on the day
            before. Wind generation offsets part of that need, but it is only known through a
            forecast. WindDesk answers two questions for every decision:
          </p>
          <ol>
            <li>
              <strong>What was the latest wind forecast at the moment of decision?</strong> The{' '}
              <Link to="/briefing">Briefing</Link> rebuilds exactly what was public at gate closure,
              hour by hour.
            </li>
            <li>
              <strong>How far can that forecast be trusted?</strong> The{' '}
              <Link to="/accuracy">Accuracy report</Link> measures its errors over the pilot, and a
              calibrated forecast with an 80% range turns those errors into a planning number.
            </li>
          </ol>

          <h2 id="data">Data</h2>
          <p>
            Two public datasets from the Elexon Insights Solution (BMRS) API, national level, with
            no other inputs:
          </p>
          <ul>
            <li>
              <strong>WINDFOR</strong>: wind generation forecasts produced by NESO. Each run has a{' '}
              <code>publishTime</code> and hourly <code>startTime</code> targets up to about two
              days ahead. About eight runs are published a day.
            </li>
            <li>
              <strong>FUELHH</strong>, fuel type <code>WIND</code>: metered wind generation per
              30-minute settlement period (<code>startTime</code>, <code>generation</code> in MW).
              It covers transmission-metered wind farms. Wind on local distribution networks
              (embedded) is not included.
            </li>
          </ul>
          <p>
            The pilot serves a versioned snapshot of both datasets, fetched{' '}
            {formatUkDayTime(m.data.fetchedAt)} UK: {m.data.forecastRecords.toLocaleString('en-GB')}{' '}
            forecast values from {m.data.forecastRuns} runs and{' '}
            {m.data.actualRecords.toLocaleString('en-GB')} settlement periods. Every file carries a
            SHA-256 checksum, and the ingestion job checks completeness before writing it. For the
            analysed window, every settlement period and every forecast hour is present.
          </p>

          <h2 id="scope">Pilot scope</h2>
          <p>
            The pilot covers every purchase decision taken from{' '}
            {formatDateLong(m.firstDecisionDate)} to {formatDateLong(m.lastDecisionDate)}. Those
            decisions are for delivery days {formatDateLong(m.firstDeliveryDate)} to{' '}
            {formatDateLong(m.lastDeliveryDate)}: 31 delivery days and 744 hourly products.
          </p>
          <p>
            The calibration for each decision learns from the {m.calibrationWindowDays} most recent
            fully settled delivery days before it, so data from mid-December 2025 is also used. Only
            data that was already public at each January decision is used for that decision.
          </p>

          <h2 id="market">Market conventions</h2>
          <ul>
            <li>
              <strong>Delivery day D</strong> runs from 23:00 UK time on D-1 to 23:00 on D, the GB
              day-ahead convention (Nord Pool GB Day-ahead Market Regulations, s.2.2.6). On
              clock-change days it is 23 or 25 hours long.
            </li>
            <li>
              <strong>Gate closure</strong> on D-1 is the decision time:{' '}
              {m.gateClosurePresets.map((p, i) => (
                <span key={p.id}>
                  {i > 0 ? ', ' : ''}
                  {p.label} {p.time}
                </span>
              ))}{' '}
              (UK time). A custom time can be set to test an earlier internal deadline.
            </li>
            <li>All times are shown in UK local time (GMT/BST). The API exchanges UTC.</li>
          </ul>

          <h2 id="decision">The decision forecast</h2>
          <p>
            For every hourly target in delivery day D, WindDesk takes the most recent WINDFOR value
            published <strong>at or before</strong> gate closure on D-1:
          </p>
          <div className="formula">
            decision_forecast(t) = WINDFOR value for t from the latest run with publishTime ≤
            gate_closure(D-1)
          </div>
          <p>
            Runs published after gate closure are never used for that decision. The briefing draws
            them dashed to show what the desk could not yet see. With the 09:50 N2EX gate closure,
            the 09:30 run is used and lead times run from 13.5 h (the 23:00 product) to 36.5 h (the
            22:00 product).
          </p>

          <h2 id="matching">Matching forecast to outturn</h2>
          <p>
            WINDFOR targets are hourly and FUELHH is half-hourly. Each forecast value is compared
            with the settlement period that starts at the same <code>startTime</code>. We compared
            this against the hourly mean of both settlement periods and against a centred average.
            Mean absolute error changed by less than 1.5%, so the simplest, fully traceable match is
            used.
          </p>

          <h2 id="metrics">Error metrics</h2>
          <p>
            <strong>Error = forecast − outturn</strong>. A positive error is an over-forecast: less
            wind arrived than forecast, so a desk relying on the forecast is short.
          </p>
          <ul>
            <li>
              <strong>Mean absolute error (MAE)</strong>: the average size of the miss, in MW.
            </li>
            <li>
              <strong>Bias</strong>: the average signed error, showing systematic over- or
              under-forecasting.
            </li>
            <li>
              <strong>RMSE</strong>: root-mean-square error, which weights large misses more.
            </li>
            <li>
              <strong>P90 / P99 absolute error</strong>: 90% (99%) of hours missed by less than
              this.
            </li>
            <li>
              <strong>WAPE</strong>: total absolute error as a share of total outturn.
            </li>
            <li>
              <strong>Range hit rate</strong>: share of hours whose outturn fell inside the
              calibrated 80% range. A well-calibrated range scores close to 80%.
            </li>
            <li>
              <strong>Safety margin</strong>: the quantile of forecast − outturn, i.e. how many MW
              to hold back from a forecast so the shortfall is covered in a given share of hours.
            </li>
          </ul>
          <p>
            Percentiles use linear interpolation between ranks (NumPy&apos;s default), so every
            figure can be reproduced in a notebook.
          </p>

          <h2 id="calibration">Calibration and range</h2>
          <p>
            The raw forecast over-forecasts, and the gap widens as the forecast rises. Before each
            decision, WindDesk fits an ordinary least-squares line on the {m.calibrationWindowDays}{' '}
            most recent delivery days whose outturn was complete before gate closure (days D-
            {m.calibrationWindowDays + 1} to D-2), using the same gate closure:
          </p>
          <div className="formula">calibrated(t) = max(0, a + b × decision_forecast(t))</div>
          <p>
            The {Math.round(m.bandCoverage * 100)}% range is the calibrated value plus the 10th and
            90th percentiles of that fit&apos;s training residuals. Its lower edge, summed over the
            day, is the &ldquo;firm at 90%&rdquo; energy on the briefing. This is a walk-forward
            backtest: the model is refitted every day from settled history only. An automated test
            checks that changing any data published after gate closure leaves the decision
            unchanged.
          </p>
          <p>
            A linear model was chosen deliberately: traders can read it, it has two parameters, and
            it fixes the dominant, level-dependent bias. Over the pilot it reduced mean absolute
            error by about 39%, and its range held the outturn 80% of the time.
          </p>

          <h2 id="lead">Lead-time analysis</h2>
          <p>
            To show how accuracy depends on how far ahead a forecast is made, the report also
            scores, for every target hour, the latest run published at least N hours earlier (N = 0
            to {m.maxLeadHours}). This is the &ldquo;fixed lead time&rdquo; mode of the{' '}
            <Link to="/explorer">Explorer</Link>. It quantifies the value of re-trading closer to
            delivery.
          </p>

          <h2 id="limits">Limitations and next steps</h2>
          <ul>
            <li>
              Only wind data is in scope, so WindDesk does not compute residual demand or
              procurement volumes. Adding the desk&apos;s demand forecast would turn the range into
              a direct purchase range.
            </li>
            <li>
              The cause of the over-forecast is not identified from these two datasets. The pattern
              by forecast level is consistent with curtailment and metering scope, and should be
              confirmed with NESO.
            </li>
            <li>
              Few hours had very low forecasts, so the calibration is least certain there. A month
              is a short sample, and the evaluation should run continuously before the range is
              relied on in production.
            </li>
            <li>
              In production, a scheduled job would ingest new runs every hour, store them in a
              time-series database and recompute the briefing as soon as each run lands.
            </li>
          </ul>
        </article>
      </div>
    </>
  )
}
