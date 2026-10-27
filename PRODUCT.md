# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React (Vite + TypeScript) front end, Python (FastAPI) back end, Docker for local and production parity, deployed to Vercel (static front end on the CDN, FastAPI as a Python serverless function). Stack fixed by the client brief; deployment target confirmed by the user.

## Users

The day-ahead power trading desk of a UK energy utility. Every morning on day D-1 they decide how much power to buy in the GB day-ahead auctions for delivery day D (23:00 D-1 to 23:00 D, UK time), before gate closure (09:50 UK for Nord Pool N2EX, 09:20 UK for EPEX SPOT GB). Wind is weather-dependent, so they must decide how much to buy from other sources based on the wind forecast. Secondary audience: the internal technical lead reviewing the build.

## Product Purpose

WindDesk shows the desk (1) exactly the latest national wind generation forecast that was available at their decision time, and (2) a quantified, honest account of how wrong that forecast tends to be, so they can size their purchases with the error in mind. Success: a trader can answer "how much wind can I count on tomorrow, and how sure am I?" in under a minute, and trusts the answer.

## Positioning

Decision-time truth, not hindsight. Every number is reconstructed as of gate closure on D-1 (forecasts published after gate closure are never used for that decision). On top of the raw forecast, a walk-forward calibration trained only on already-settled days removes the forecast's systematic over-forecast and supplies an empirical 80% range. In the January 2026 pilot this cut day-ahead mean absolute error from 1,991 MW to 1,221 MW (-38.7%), with the 80% range containing the outturn 80.0% of the time.

## Operating Context

Used on desktop at the trading desk in the morning before gate closure, alongside trading screens and spreadsheets; also presented to client stakeholders as the result of a pilot. Units the desk thinks in: MW, MWh/GWh, settlement periods (30 min), hourly day-ahead products, UK local time.

## Capabilities and Constraints

- Data is limited to two Elexon Insights (BMRS) datasets: WINDFOR (wind forecasts, hourly targets, about 8 runs per day) and FUELHH fuel type WIND (metered half-hourly outturn). No demand, price or other data.
- Pilot scope: purchase decisions taken 1 to 31 January 2026 (delivery days 2 Jan to 1 Feb 2026). The calibration looks back 14 settled days, so December 2025 data that was public before each January decision is also used.
- Views: Day-ahead briefing (one delivery day), Accuracy report (whole pilot), Explorer (any range, decision-time or fixed lead-time mode), Methodology.
- Forecast error convention: forecast minus actual; positive means over-forecast (wind shortfall, the desk is short).

## Brand Commitments

Product name: WindDesk. No logo or brand assets exist.

## Evidence on Hand

Real Elexon data snapshot in `backend/app/data/snapshot/` and the computed pilot results above. No customer testimonials, logos, prices or commercial claims exist; none may be invented.

## Product Principles

1. Never show hindsight as foresight: decision views use only information public at gate closure.
2. Quantify uncertainty in the desk's own units (MW, MWh), not abstract scores.
3. Every number is traceable to its definition and data source.
4. Familiar, fast, scannable: the tool disappears into the morning routine.

## Accessibility & Inclusion

WCAG 2.2 AA: keyboard operable, visible focus, sufficient contrast, colour never the only carrier of meaning, a table view for every chart.
