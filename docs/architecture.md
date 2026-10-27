# Architecture and design decisions

This document is for the technical reviewer. It explains how WindDesk is put together,
why, and what was deliberately left out. The README covers how to run it.

## 1. Problem shape

The client needs two things for every day-ahead purchase decision:

1. the forecast **as it existed at the decision time**, and
2. an **honest error model** for that forecast.

Both depend on one primitive: *"the latest forecast for target hour t published at or
before instant x"*. Everything else (the briefing, lead-time curves, calibration
training sets, the accuracy report) is built on that query, so it is fast, explicit
and heavily tested.

Constraints from the brief:

- React front end and Python back end.
- Docker.
- Deployment on Vercel or Heroku.
- Elexon `WINDFOR` and `FUELHH` (WIND) data only.
- Scope: decisions taken in January 2026.

## 2. Layers

```text
backend/app
├── domain/     pure functions and value objects, no I/O
│   ├── market.py          delivery day [23:00 D-1, 23:00 D) UK, gate closure, DST-safe
│   ├── forecast_book.py   ForecastBook (target -> sorted publish times), ActualSeries
│   ├── metrics.py         error metrics, NumPy-compatible percentiles
│   └── calibration.py     OLS fit + empirical residual band
├── data/       I/O at the edges
│   ├── elexon_client.py   chunked, retried, schema-validated BMRS client
│   ├── repository.py      snapshot (gzip JSON + manifest) and live loading
│   └── quality.py         completeness checks used at ingestion
├── services/
│   └── analytics.py       composes the domain into API views, memoises results
├── api/        FastAPI routes + dependency wiring (lazy, thread-safe singleton)
├── schemas.py  response DTOs (snake_case in Python, camelCase on the wire)
└── main.py     app factory: middleware, error mapping, optional SPA serving
```

Dependencies point inwards: `api → services → domain`, and `data → domain`. The domain
never imports FastAPI, httpx or pydantic, so the market logic and the statistics can be
tested exhaustively without a server or network.

## 3. Data pipeline

`python -m app.ingest` fetches exactly the window the analysis needs, computed from
configuration (`repository.ingestion_windows`):

- **Forecasts.** Runs published from 15 Dec 2025 23:00 UTC to 1 Feb 2026 23:00 UTC. The
  first January decision is calibrated on 14 settled December days, whose own decision
  forecasts were published from mid-December.
- **Outturn.** Settlement dates 17 Dec 2025 to 1 Feb 2026.

The client splits requests into 7-day chunks. It retries HTTP 429, HTTP 5xx and
transport errors with exponential back-off, and validates every row with pydantic. It
also de-duplicates overlapping chunk boundaries and keeps the latest restatement of any
settlement period. Quality checks then confirm completeness: all 1,488 settlement periods
and all 744 forecast hours of the evaluation window are present.

The snapshot is gzip-compressed JSON written with `mtime=0`, so identical data gives
identical bytes. A manifest records the source windows, record counts and SHA-256
checksums. Loading verifies all three and fails loudly on mismatch.

**Why a snapshot rather than calling Elexon per request?** The pilot window is history,
so a snapshot gives:

- reproducible numbers, which are pinned by `test_snapshot_regression.py`
- millisecond responses and fast serverless cold starts (about 165 KB of data)
- immunity to upstream outages during a client demo

`WINDDESK_DATA_SOURCE=live` loads the same window from Elexon at start-up. In production
the ingestion CLI would become an hourly scheduled job writing to a time-series store;
the domain and service layers would not change.

## 4. Core algorithms

### Forecast selection

`ForecastBook` builds, for each target hour, a list of publish times sorted ascending
plus the parallel values. `latest_as_of(t, x)` is a `bisect_right`, so `O(log r)` per
lookup where r is the number of runs per target (24 on average, at most 32, in the snapshot). The fixed-lead mode is the
same query with `x = t − lead`.

### Decision forecast

For delivery day D and gate closure g:

```text
cutoff = UK-local(D-1, g) as UTC
for every hourly target t in [23:00 D-1, 23:00 D):  latest_as_of(t, cutoff)
```

### Calibration (walk-forward)

The training days are the most recent 14 delivery days whose window ended before the
cutoff, i.e. D-15 to D-2. D-1 is still in delivery at gate closure, so it is excluded by
rule rather than by hand-picked indices.

The training pairs are the decision forecasts of those days, at the same gate closure,
against outturn. The model is OLS, `outturn ≈ a + b·forecast`; if the training forecasts
have zero variance it falls back to a pure bias shift. The band is the fitted value plus
the 10th and 90th percentiles of the training residuals. Predictions and band edges are
clipped at 0 MW.

Alternatives were back-tested on the January decisions (MAE of the corrected forecast;
raw = 1,991 MW):

| Correction (14-day window) | MAE | Notes |
|---|---:|---|
| Mean shift | 1,486 MW | ignores that the bias grows with level |
| Ratio scaling | 1,282 MW | |
| **Linear (OLS)** | **1,221 MW** | chosen: best, still two readable parameters |

| Window length (linear) | MAE | 80% band coverage |
|---|---:|---:|
| 7 days | 1,545 MW | 62% (under-covers) |
| **14 days** | **1,221 MW** | **80%** |
| 21 days | 1,227 MW | 78% |
| 28 days | 1,192 MW | 80% |

The 14-day window was chosen because its range is exactly calibrated and it adapts
faster to regime changes than 28 days, for a negligible MAE difference.

### Forecast-to-outturn matching

WINDFOR is hourly and FUELHH is half-hourly. Three alignments were compared:

- the period starting at the same `startTime`
- the mean of the hour's two periods
- a centred average

MAE differed by less than 1.5%, so the simplest and most traceable match (same
`startTime`) is used.

## 5. Correctness safeguards

- **No look-ahead.** `test_decision_uses_no_information_published_after_gate_closure`
  rewrites every forecast and outturn value published after the cutoff and asserts that
  the decision forecast, the calibration and the band are unchanged.
- **Clock changes.** Delivery days on 29 Mar 2026 (23 h) and 25 Oct 2026 (25 h) are
  tested, and gate closure converts correctly in BST.
- **Statistics.** Metrics are checked against hand-computed values. Percentiles match
  NumPy's linear method, so any figure can be reproduced in a notebook.
- **Golden numbers.** The headline accuracy figures quoted to the client are asserted
  against the committed snapshot.

## 6. API design

- Five read-only `GET` endpoints with explicit response models. FastAPI generates the
  OpenAPI document served at `/api/docs`.
- Inputs are validated at two levels: FastAPI for types and ranges, and the service for
  domain scope (delivery date in pilot, gate closure before 23:00). Domain errors become
  `422` with a sentence the UI can show as-is. Data-source failures become `503` and are
  logged server-side without leaking detail.
- Responses are deterministic for a snapshot, so successful API responses carry
  `Cache-Control: public, max-age=300, s-maxage=86400` for the CDN, and are
  gzip-compressed. The service memoises decision forecasts, calibrations and the accuracy
  report per gate closure; the full report computes in about 0.1 s.
- The analytics service loads lazily on the first request behind a lock, so imports are
  instant (important for serverless) and the process starts even if data is briefly
  unavailable.

## 7. Front end

- **State:**
  - Server state lives in TanStack Query: `staleTime: Infinity` (the data is immutable),
    `keepPreviousData` (a refetch keeps the current view, dimmed, instead of flashing a
    skeleton), and no retries on 422.
  - View state lives in the URL (`/briefing/2026-01-15?gc=09:20`, `/explorer?from=…&mode=lead&lead=24`),
    so every view is shareable and the back button works.
- **Time:** every clock time is rendered in `Europe/London` via `Intl.DateTimeFormat`,
  whatever the viewer's time zone. Calendar dates are formatted in UTC to avoid
  off-by-one-day drift.
- **Charts:**
  - Recharts with a small set of shared conventions (`lib/chart.ts`): clean 1/2/2.5/5
    tick steps, hairline grids, and 8 px active markers with a surface ring.
  - Series colours are fixed per entity and were validated for colour-vision deficiency
    and contrast against the background.
  - Every chart panel has a table view.
- **Design system:** a dark trading-terminal theme, chosen for the desk's environment. It
  is defined as CSS custom properties in `styles/global.css` and documented in
  `DESIGN.md`.
- **Performance:** Briefing ships in the main bundle; the other pages are lazy-loaded.
  Vendor and chart libraries are split into long-lived chunks.
- **Accessibility:**
  - semantic tables with row headers
  - a skip link
  - visible focus
  - a roving-tabindex day rail
  - keyboard shortcuts that ignore form fields
  - reduced-motion support
  - text contrast of at least 4.5:1

## 8. Delivery

- **Docker:** a multi-stage build (Node 22 builds the SPA, then a `python:3.12-slim`
  runtime). It runs as a non-root user (uid 10001), has a `HEALTHCHECK` on `/api/health`,
  binds `$PORT` (Heroku-compatible), and FastAPI serves both `/api` and the SPA with
  history fallback.
- **Vercel:**
  - The Vite build is served from the CDN, and `api/index.py` runs as a Python function.
  - `vercel.json` rewrites `/api/:wdroute*` to the function.
  - A small ASGI adapter restores `/api/<route>` if the platform invokes the function
    with the rewrite destination, so routing is identical across environments. This is
    tested in `test_vercel_entrypoint.py`.
- **CI (GitHub Actions):** backend (format, lint, mypy strict, pytest with a 95% coverage
  gate), frontend (format, lint, typecheck, tests, build), then a Docker build and smoke
  test against the running container.

## 9. What I would do next

1. **Scheduled ingestion:** hourly ingestion into Postgres/TimescaleDB, with the briefing
   recomputed as each run lands and alerts when the calibrated range widens sharply.
2. **Demand forecast:** add the client's demand forecast so the range becomes a direct
   purchase range.
3. **Richer error model:** consider calibration features beyond forecast level (lead time,
   season, wind ramps) once more history is available, keeping the linear model as a
   transparent baseline.
4. **Production readiness:** authentication (SSO) and per-user saved views.
