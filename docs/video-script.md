# Demo video talk track (10 minutes maximum)

Two parts, each 5 minutes or less. Record at 1440×900 or larger, browser zoom 100%, dark
desktop, notifications off. Open the live Vercel app in one tab and the repository in
your editor. The suggested timings leave about 30 s of slack per part.

---

## Part 1: client pitch (about 4:30)

**Audience:** the day-ahead trading team. **Goal:** they see it is built for their
morning decision and that the numbers are trustworthy.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Briefing, latest day | "Every morning you decide how much power to buy for tomorrow before the auction closes at 09:50. Wind covers a large, changing share of that, and you only know it through a forecast. WindDesk answers two questions: what did the forecast say when you had to decide, and how far can you trust it?" |
| 0:30 | Command bar, gate-closure presets | "Everything is anchored to your decision time: the N2EX gate closure at 09:50, the EPEX one at 09:20, or your own internal deadline. WindDesk shows only what was public at that moment, never anything published later." |
| 0:55 | Quote line | "For Thursday 15 January: the national forecast, from the 09:30 run 20 minutes before gate closure, said 287 GWh of wind. Our calibrated view expected 256 GWh, and with 90% confidence at least 197 GWh. What actually arrived was 260 GWh." |
| 1:30 | Hover the blotter rows, then the chart | "This is your blotter: one row per hourly product. It shows the forecast you saw, our calibrated figure, the 80% range drawn inline and, after the fact, the outturn. Hovering a row marks that hour on the chart. 23 of 24 hours landed inside the range." |
| 2:05 | Forecast evolution | "This shows how the forecast moved run by run. The heavy line is what you decided on. The dashed lines came after gate closure, so you couldn't have used them." |
| 2:25 | Accuracy page, headline table | "Across every decision in January, 744 hourly products: the forecast you would have used was off by 2.0 GW on average, and it was almost always too high, by 1.7 GW, or 15% more energy than arrived. Taken at face value, it leaves you short." |
| 3:00 | Bias by forecast level | "The shortfall grows with the wind: when 18 to 21 GW was forecast, about 3.4 GW less turned up. That points to high-wind curtailment, and it is something we can correct." |
| 3:25 | Daily chart, then the 80% range row | "So WindDesk calibrates the forecast every morning, using only the last 14 settled days, never hindsight. That cut the average error by 39%, from 1,991 to 1,221 MW. And its 80% range held the outturn exactly 80% of the time, so you can size your purchases on it." |
| 4:00 | Safety margin table | "In practice: to be covered in 9 hours out of 10, you would hold back 4.2 GW from the raw forecast, but only 2.4 GW from the calibrated one. That is less over-buying for the same protection." |
| 4:20 | Lead-time chart | "One more thing: forecasts sharpen by 13% as delivery approaches, which is the value of re-trading intraday. Next we'd plug in your demand forecast to turn this into a direct purchase range." |

---

## Part 2: technical walkthrough (about 4:45)

**Audience:** the technical lead. **Goal:** they can review quickly and trust the build.

| Time | Screen | Say |
|---|---|---|
| 0:00 | README architecture diagram | "React 19 with TypeScript on the front, FastAPI on Python 3.12 behind it, Elexon's WINDFOR and FUELHH as the only data. It ships as one Docker image and on Vercel as a CDN site plus a Python function." |
| 0:25 | `backend/app` tree | "The backend is layered. `domain` is pure logic with no I/O: market rules, forecast selection, metrics, calibration. `data` handles Elexon and the snapshot. `services/analytics.py` composes them, and `api` is a thin FastAPI layer with typed response models." |
| 0:55 | `domain/market.py` | "The delivery day runs 23:00 to 23:00 UK time and gate closure is on D-1. Everything goes through Europe/London, so BST and the 23- and 25-hour clock-change days are handled and tested." |
| 1:20 | `domain/forecast_book.py` | "The core query is: the latest forecast for hour t published at or before x. Each target keeps its runs sorted, so that's a binary search. The decision forecast and the lead-time analysis are both this one query." |
| 1:50 | `services/analytics.py` training_days + `domain/calibration.py` | "Calibration is walk-forward: OLS on the 14 delivery days settled before gate closure, with the residual 10th and 90th percentiles as the range. I back-tested mean shift, ratio and linear models, and 7- to 28-day windows; 14-day linear gave the lowest error with exactly calibrated coverage." |
| 2:30 | `tests/test_analytics.py` leakage test | "The key safeguard is this test. It rewrites every value published after gate closure and asserts the decision is unchanged, so look-ahead is impossible by construction. There are 95 backend tests at 99% coverage, plus golden tests on the real January numbers." |
| 3:00 | `data/elexon_client.py`, `ingest.py`, `snapshot/manifest.json` | "Ingestion fetches exactly the window needed, in chunks, with retries and pydantic validation, then quality checks. It writes a deterministic gzip snapshot with SHA-256 checksums. Serving a snapshot makes demos reproducible and fast; `DATA_SOURCE=live` fetches from Elexon instead." |
| 3:30 | `frontend/src` tree, `api/queries.ts` | "On the front end, React Query holds server state, with keep-previous-data so views never flash. View state is in the URL. Every time is rendered in UK time, and pages are lazy-loaded. The chart colours were validated for colour-blindness, and every chart has a table view." |
| 4:00 | `Dockerfile`, `vercel.json`, `api/index.py`, CI workflow | "There's a multi-stage Docker build, a non-root runtime and a health check. Vercel serves the SPA, and a tiny tested adapter keeps routing identical. CI runs Ruff, mypy strict, pytest, oxlint, tsc, Vitest, the build and a container smoke test." |
| 4:30 | Methodology page / README limitations | "Known limits: wind only, one month of data, and the bias cause isn't confirmed. Next would be scheduled hourly ingestion into a time-series database, plus the demand forecast. Thanks." |

---

## Recording checklist

- Use the live Vercel URL, not localhost, so reviewers see the deployed app.
- Pre-load each page once so the charts appear instantly on camera.
- Upload to YouTube with visibility **Unlisted**, then open the link in a private window
  to confirm access before submitting.
