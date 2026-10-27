"""Decision-centric analytics over the wind forecast and outturn data.

Key definitions (see the Methodology page of the app for the client-facing version):

* **Decision forecast** - for every hourly target time in delivery day ``D``, the most
  recent WINDFOR value published at or before gate closure on ``D-1``. This is exactly
  the information a day-ahead trader had when the order was submitted.
* **Calibrated forecast** - the decision forecast passed through a linear correction
  fitted on the preceding ``calibration_window_days`` delivery days that had fully
  settled before gate closure (walk-forward, so no hindsight).
* **Error** - ``forecast - actual``, matched on the settlement period starting at the
  forecast's target time.

All results are deterministic for a given dataset, so they are memoised per instance.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal, TypedDict

from app import __version__
from app import schemas as s
from app.config import Settings
from app.data.repository import Dataset
from app.domain.calibration import LinearCalibration, fit_linear_calibration
from app.domain.forecast_book import ActualSeries, ForecastBook, SelectedForecast
from app.domain.market import (
    GATE_CLOSURE_PRESETS,
    SETTLEMENT_PERIOD,
    UK_TZ,
    DeliveryWindow,
    decision_cutoff,
    delivery_window,
    format_gate_closure,
    iter_dates,
)
from app.domain.metrics import ErrorMetrics, compute_error_metrics, percentile

PRODUCT_NAME = "WindDesk"
DATA_PROVIDER = "Elexon Insights Solution (BMRS): WINDFOR and FUELHH (fuel type WIND)"
FORECAST_STEP = timedelta(hours=1)
HOURS_PER_FORECAST_STEP = FORECAST_STEP / timedelta(hours=1)
HOURS_PER_SETTLEMENT_PERIOD = SETTLEMENT_PERIOD / timedelta(hours=1)
BUFFER_CONFIDENCES = (0.5, 0.8, 0.9, 0.95, 0.99)
LEVEL_BIN_MW = 3000.0
HISTOGRAM_BIN_MW = 500.0
VINTAGE_LOOKBACK = timedelta(hours=24)

Mode = Literal["decision", "lead"]


class InvalidRequestError(ValueError):
    """The request is well-formed but asks for something outside the analysed scope."""


@dataclass(frozen=True, slots=True)
class DecisionPoint:
    forecast: SelectedForecast
    actual_mw: float | None
    calibrated_mw: float | None
    lower_mw: float | None
    upper_mw: float | None

    @property
    def start_time(self) -> datetime:
        return self.forecast.start_time


@dataclass(frozen=True, slots=True)
class DayDecision:
    delivery_date: date
    window: DeliveryWindow
    cutoff: datetime
    calibration: LinearCalibration | None
    points: tuple[DecisionPoint, ...]


@dataclass(frozen=True, slots=True)
class ScoredPoint:
    """A decision point for which the metered outturn is known."""

    start_time: datetime
    lead_hours: float
    forecast_mw: float
    actual_mw: float
    calibrated_mw: float | None
    lower_mw: float | None
    upper_mw: float | None


class SegmentFields(TypedDict):
    count: int
    raw_mae_mw: float
    raw_bias_mw: float
    calibrated_mae_mw: float | None
    calibrated_bias_mw: float | None


# --------------------------------------------------------------------------- helpers


def _mw(value: float) -> float:
    return round(value, 1)


def _opt_mw(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


def _metrics_out(metrics: ErrorMetrics | None) -> s.ErrorMetricsOut | None:
    if metrics is None:
        return None
    return s.ErrorMetricsOut(
        count=metrics.count,
        mae_mw=_mw(metrics.mae_mw),
        rmse_mw=_mw(metrics.rmse_mw),
        bias_mw=_mw(metrics.bias_mw),
        median_abs_error_mw=_mw(metrics.median_abs_error_mw),
        p90_abs_error_mw=_mw(metrics.p90_abs_error_mw),
        p99_abs_error_mw=_mw(metrics.p99_abs_error_mw),
        max_over_forecast_mw=_mw(metrics.max_over_forecast_mw),
        max_under_forecast_mw=_mw(metrics.max_under_forecast_mw),
        wape_pct=None if metrics.wape_pct is None else round(metrics.wape_pct, 2),
        correlation=None if metrics.correlation is None else round(metrics.correlation, 4),
    )


def _scored(points: Iterable[DecisionPoint]) -> list[ScoredPoint]:
    return [
        ScoredPoint(
            start_time=p.start_time,
            lead_hours=p.forecast.lead_hours,
            forecast_mw=p.forecast.generation_mw,
            actual_mw=p.actual_mw,
            calibrated_mw=p.calibrated_mw,
            lower_mw=p.lower_mw,
            upper_mw=p.upper_mw,
        )
        for p in points
        if p.actual_mw is not None
    ]


def _raw_metrics(points: Sequence[ScoredPoint]) -> ErrorMetrics | None:
    return compute_error_metrics([p.forecast_mw for p in points], [p.actual_mw for p in points])


def _calibrated_metrics(points: Sequence[ScoredPoint]) -> ErrorMetrics | None:
    pairs = [(p.calibrated_mw, p.actual_mw) for p in points if p.calibrated_mw is not None]
    return compute_error_metrics([f for f, _ in pairs], [a for _, a in pairs])


def _metrics_pair(points: Sequence[DecisionPoint]) -> s.MetricsPair:
    scored = _scored(points)
    return s.MetricsPair(
        raw=_metrics_out(_raw_metrics(scored)),
        calibrated=_metrics_out(_calibrated_metrics(scored)),
    )


def _point_out(point: DecisionPoint) -> s.ForecastPointOut:
    return s.ForecastPointOut(
        start_time=point.start_time,
        forecast_mw=_mw(point.forecast.generation_mw),
        publish_time=point.forecast.publish_time,
        lead_hours=round(point.forecast.lead_hours, 2),
        actual_mw=_opt_mw(point.actual_mw),
        calibrated_mw=_opt_mw(point.calibrated_mw),
        lower_mw=_opt_mw(point.lower_mw),
        upper_mw=_opt_mw(point.upper_mw),
    )


def _calibration_out(calibration: LinearCalibration | None) -> s.CalibrationOut | None:
    if calibration is None or not calibration.training_days:
        return None
    return s.CalibrationOut(
        slope=round(calibration.slope, 4),
        intercept_mw=_mw(calibration.intercept_mw),
        residual_lower_mw=_mw(calibration.residual_lower_mw),
        residual_upper_mw=_mw(calibration.residual_upper_mw),
        coverage=calibration.coverage,
        training_from=calibration.training_days[0],
        training_to=calibration.training_days[-1],
        training_days=len(calibration.training_days),
        training_points=calibration.training_points,
    )


def _segment(points: Sequence[ScoredPoint]) -> SegmentFields:
    raw = _raw_metrics(points)
    calibrated = _calibrated_metrics(points)
    if raw is None:
        raise ValueError("segment must contain at least one scored point")
    return SegmentFields(
        count=raw.count,
        raw_mae_mw=_mw(raw.mae_mw),
        raw_bias_mw=_mw(raw.bias_mw),
        calibrated_mae_mw=None if calibrated is None else _mw(calibrated.mae_mw),
        calibrated_bias_mw=None if calibrated is None else _mw(calibrated.bias_mw),
    )


def _energy_mwh(values: Iterable[float], hours_per_value: float) -> float:
    return math.fsum(values) * hours_per_value


def _group(
    points: Iterable[ScoredPoint], key: Callable[[ScoredPoint], int]
) -> dict[int, list[ScoredPoint]]:
    groups: dict[int, list[ScoredPoint]] = defaultdict(list)
    for point in points:
        groups[key(point)].append(point)
    return dict(sorted(groups.items()))


def _histogram(
    raw_errors: Sequence[float], calibrated_errors: Sequence[float], width: float
) -> list[s.HistogramBinOut]:
    values = [*raw_errors, *calibrated_errors]
    if not values:
        return []
    lowest = math.floor(min(values) / width) * width
    bin_count = math.floor((max(values) - lowest) / width) + 1
    raw_counts = [0] * bin_count
    calibrated_counts = [0] * bin_count
    for errors, counts in ((raw_errors, raw_counts), (calibrated_errors, calibrated_counts)):
        for error in errors:
            counts[min(math.floor((error - lowest) / width), bin_count - 1)] += 1
    return [
        s.HistogramBinOut(
            lower_mw=lowest + i * width,
            upper_mw=lowest + (i + 1) * width,
            raw_count=raw_counts[i],
            calibrated_count=calibrated_counts[i],
        )
        for i in range(bin_count)
    ]


# --------------------------------------------------------------------------- service


class ForecastAnalytics:
    def __init__(self, dataset: Dataset, settings: Settings) -> None:
        self._dataset = dataset
        self._settings = settings
        self.book = ForecastBook(dataset.forecasts)
        self.actuals = ActualSeries(dataset.actuals)
        self._decision_cache: dict[tuple[date, time], tuple[SelectedForecast, ...]] = {}
        self._calibration_cache: dict[tuple[date, time], LinearCalibration | None] = {}
        self._accuracy_cache: dict[time, s.AccuracyOut] = {}
        self._lead_curve_cache: list[s.LeadAccuracyOut] | None = None

    # ------------------------------------------------------------- scope

    @property
    def delivery_dates(self) -> list[date]:
        return iter_dates(self._settings.first_delivery_date, self._settings.last_delivery_date)

    @property
    def evaluation_window(self) -> DeliveryWindow:
        first = delivery_window(self._settings.first_delivery_date)
        last = delivery_window(self._settings.last_delivery_date)
        return DeliveryWindow(delivery_date=first.delivery_date, start=first.start, end=last.end)

    def require_delivery_date(self, delivery_date: date) -> None:
        first = self._settings.first_delivery_date
        last = self._settings.last_delivery_date
        if not first <= delivery_date <= last:
            raise InvalidRequestError(
                f"Delivery date must be between {first.isoformat()} and {last.isoformat()} "
                f"(purchase decisions taken {self._settings.first_decision_date.isoformat()} "
                f"to {self._settings.last_decision_date.isoformat()})"
            )

    # ------------------------------------------------------------- decision forecasts

    def raw_decision_forecasts(
        self, delivery_date: date, gate_closure: time
    ) -> tuple[SelectedForecast, ...]:
        """Latest forecast per target hour of ``delivery_date`` known at gate closure."""
        key = (delivery_date, gate_closure)
        cached = self._decision_cache.get(key)
        if cached is None:
            window = delivery_window(delivery_date)
            cutoff = decision_cutoff(delivery_date, gate_closure)
            cached = tuple(
                selected
                for target in self.book.target_times(window.start, window.end)
                if (selected := self.book.latest_as_of(target, cutoff)) is not None
            )
            self._decision_cache[key] = cached
        return cached

    def training_days(self, delivery_date: date, gate_closure: time) -> list[date]:
        """Most recent delivery days whose outturn was complete before the decision."""
        cutoff = decision_cutoff(delivery_date, gate_closure)
        window_days = self._settings.calibration_window_days
        candidates = (delivery_date - timedelta(days=k) for k in range(1, window_days + 2))
        settled = [day for day in candidates if delivery_window(day).end <= cutoff]
        return sorted(settled[:window_days])

    def calibration(self, delivery_date: date, gate_closure: time) -> LinearCalibration | None:
        key = (delivery_date, gate_closure)
        if key in self._calibration_cache:
            return self._calibration_cache[key]

        forecasts: list[float] = []
        actuals: list[float] = []
        days_used: list[date] = []
        for day in self.training_days(delivery_date, gate_closure):
            used = False
            for selected in self.raw_decision_forecasts(day, gate_closure):
                actual = self.actuals.get(selected.start_time)
                if actual is not None:
                    forecasts.append(selected.generation_mw)
                    actuals.append(actual)
                    used = True
            if used:
                days_used.append(day)

        result = fit_linear_calibration(
            forecasts,
            actuals,
            coverage=self._settings.band_coverage,
            training_days=days_used,
            min_points=self._settings.calibration_min_points,
        )
        self._calibration_cache[key] = result
        return result

    def day_decision(self, delivery_date: date, gate_closure: time) -> DayDecision:
        calibration = self.calibration(delivery_date, gate_closure)
        points: list[DecisionPoint] = []
        for selected in self.raw_decision_forecasts(delivery_date, gate_closure):
            calibrated = lower = upper = None
            if calibration is not None:
                calibrated = calibration.predict(selected.generation_mw)
                lower, upper = calibration.band(selected.generation_mw)
            points.append(
                DecisionPoint(
                    forecast=selected,
                    actual_mw=self.actuals.get(selected.start_time),
                    calibrated_mw=calibrated,
                    lower_mw=lower,
                    upper_mw=upper,
                )
            )
        return DayDecision(
            delivery_date=delivery_date,
            window=delivery_window(delivery_date),
            cutoff=decision_cutoff(delivery_date, gate_closure),
            calibration=calibration,
            points=tuple(points),
        )

    # ------------------------------------------------------------- views

    def health(self) -> s.HealthOut:
        return s.HealthOut(
            status="ok", version=__version__, data_source=self._dataset.provenance.source
        )

    def meta(self) -> s.MetaOut:
        provenance = self._dataset.provenance
        window = self.evaluation_window
        return s.MetaOut(
            product=PRODUCT_NAME,
            version=__version__,
            timezone=str(UK_TZ),
            first_decision_date=self._settings.first_decision_date,
            last_decision_date=self._settings.last_decision_date,
            first_delivery_date=self._settings.first_delivery_date,
            last_delivery_date=self._settings.last_delivery_date,
            evaluation_window=s.Interval(start=window.start, end=window.end),
            default_gate_closure=format_gate_closure(self._settings.default_gate_closure),
            gate_closure_presets=[
                s.GateClosurePresetOut(id=p.id, label=p.label, time=format_gate_closure(p.time))
                for p in GATE_CLOSURE_PRESETS
            ],
            calibration_window_days=self._settings.calibration_window_days,
            band_coverage=self._settings.band_coverage,
            max_lead_hours=self._settings.max_lead_hours,
            data=s.DataProvenanceOut(
                source=provenance.source,
                provider=DATA_PROVIDER,
                fetched_at=provenance.fetched_at,
                forecast_publish_from=provenance.windows.forecast_publish_from,
                forecast_publish_to=provenance.windows.forecast_publish_to,
                actual_settlement_from=provenance.windows.actual_settlement_from,
                actual_settlement_to=provenance.windows.actual_settlement_to,
                forecast_records=len(self.book),
                forecast_runs=len(self.book.publish_times),
                actual_records=len(self.actuals),
            ),
        )

    def briefing(self, delivery_date: date, gate_closure: time) -> s.BriefingOut:
        self.require_delivery_date(delivery_date)
        day = self.day_decision(delivery_date, gate_closure)
        window = day.window
        points = day.points
        actuals = self.actuals.between(window.start, window.end)
        expected_points = round(window.duration / FORECAST_STEP)
        expected_periods = round(window.duration / SETTLEMENT_PERIOD)
        publish_used = max((p.forecast.publish_time for p in points), default=None)
        leads = [p.forecast.lead_hours for p in points]

        summary: s.DaySummaryOut | None = None
        if points:
            complete = len(points) == expected_points
            values = [p.forecast.generation_mw for p in points]
            peak = max(points, key=lambda p: p.forecast.generation_mw)
            trough = min(points, key=lambda p: p.forecast.generation_mw)
            calibrated = [p.calibrated_mw for p in points if p.calibrated_mw is not None]
            lower = [p.lower_mw for p in points if p.lower_mw is not None]
            has_calibration = complete and len(calibrated) == len(points)
            summary = s.DaySummaryOut(
                forecast_energy_mwh=(
                    _mw(math.fsum(values) * HOURS_PER_FORECAST_STEP) if complete else None
                ),
                calibrated_energy_mwh=(
                    _mw(math.fsum(calibrated) * HOURS_PER_FORECAST_STEP)
                    if has_calibration
                    else None
                ),
                dependable_energy_mwh=(
                    _mw(math.fsum(lower) * HOURS_PER_FORECAST_STEP) if has_calibration else None
                ),
                actual_energy_mwh=(
                    _mw(math.fsum(v for _, v in actuals) * HOURS_PER_SETTLEMENT_PERIOD)
                    if len(actuals) == expected_periods
                    else None
                ),
                forecast_mean_mw=_mw(math.fsum(values) / len(values)),
                forecast_peak_mw=_mw(peak.forecast.generation_mw),
                forecast_peak_time=peak.start_time,
                forecast_min_mw=_mw(trough.forecast.generation_mw),
                forecast_min_time=trough.start_time,
            )

        lookback_from = day.cutoff - VINTAGE_LOOKBACK
        if publish_used is not None:
            lookback_from = min(lookback_from, publish_used)
        vintages = []
        for publish_time in self.book.publish_times_between(lookback_from, window.start):
            run = self.book.run(publish_time, window.start, window.end)
            if run:
                vintages.append(
                    s.VintageOut(
                        publish_time=publish_time,
                        available_at_decision=publish_time <= day.cutoff,
                        used_for_decision=publish_time == publish_used,
                        points=[
                            s.VintagePointOut(start_time=t, forecast_mw=_mw(v)) for t, v in run
                        ],
                    )
                )

        return s.BriefingOut(
            delivery_date=delivery_date,
            decision_date=delivery_date - timedelta(days=1),
            gate_closure=format_gate_closure(gate_closure),
            decision_cutoff=day.cutoff,
            window=s.Interval(start=window.start, end=window.end),
            forecast_publish_time=publish_used,
            next_publish_time=self.book.first_publish_after(day.cutoff),
            lead_hours_min=round(min(leads), 2) if leads else None,
            lead_hours_max=round(max(leads), 2) if leads else None,
            expected_points=expected_points,
            calibration=_calibration_out(day.calibration),
            summary=summary,
            metrics=_metrics_pair(points),
            points=[_point_out(p) for p in points],
            actuals=[s.ActualPointOut(start_time=t, generation_mw=_mw(v)) for t, v in actuals],
            vintages=vintages,
        )

    def timeseries(
        self,
        from_date: date,
        to_date: date,
        *,
        mode: Mode,
        gate_closure: time,
        lead_hours: int,
    ) -> s.TimeSeriesOut:
        self.require_delivery_date(from_date)
        self.require_delivery_date(to_date)
        if to_date < from_date:
            raise InvalidRequestError("The end date must not be before the start date")
        if not 0 <= lead_hours <= self._settings.max_lead_hours:
            raise InvalidRequestError(
                f"Lead time must be between 0 and {self._settings.max_lead_hours} hours"
            )

        start = delivery_window(from_date).start
        end = delivery_window(to_date).end
        points: list[DecisionPoint]
        if mode == "decision":
            points = [
                point
                for day in iter_dates(from_date, to_date)
                for point in self.day_decision(day, gate_closure).points
            ]
        else:
            lead = timedelta(hours=lead_hours)
            points = [
                DecisionPoint(
                    forecast=selected,
                    actual_mw=self.actuals.get(target),
                    calibrated_mw=None,
                    lower_mw=None,
                    upper_mw=None,
                )
                for target in self.book.target_times(start, end)
                if (selected := self.book.latest_with_min_lead(target, lead)) is not None
            ]

        return s.TimeSeriesOut(
            mode=mode,
            gate_closure=format_gate_closure(gate_closure) if mode == "decision" else None,
            lead_hours=lead_hours if mode == "lead" else None,
            from_date=from_date,
            to_date=to_date,
            window=s.Interval(start=start, end=end),
            points=[_point_out(p) for p in points],
            actuals=[
                s.ActualPointOut(start_time=t, generation_mw=_mw(v))
                for t, v in self.actuals.between(start, end)
            ],
            metrics=_metrics_pair(points),
        )

    def lead_curve(self) -> list[s.LeadAccuracyOut]:
        """Accuracy of the raw forecast as a function of the minimum lead time."""
        if self._lead_curve_cache is None:
            window = self.evaluation_window
            targets = [
                (target, actual)
                for target in self.book.target_times(window.start, window.end)
                if (actual := self.actuals.get(target)) is not None
            ]
            curve: list[s.LeadAccuracyOut] = []
            for lead_hours in range(self._settings.max_lead_hours + 1):
                lead = timedelta(hours=lead_hours)
                forecasts: list[float] = []
                actuals: list[float] = []
                for target, actual in targets:
                    selected = self.book.latest_with_min_lead(target, lead)
                    if selected is not None:
                        forecasts.append(selected.generation_mw)
                        actuals.append(actual)
                metrics = compute_error_metrics(forecasts, actuals)
                if metrics is not None:
                    curve.append(
                        s.LeadAccuracyOut(
                            lead_hours=lead_hours,
                            count=metrics.count,
                            mae_mw=_mw(metrics.mae_mw),
                            bias_mw=_mw(metrics.bias_mw),
                            p90_abs_error_mw=_mw(metrics.p90_abs_error_mw),
                        )
                    )
            self._lead_curve_cache = curve
        return self._lead_curve_cache

    def accuracy(self, gate_closure: time) -> s.AccuracyOut:
        cached = self._accuracy_cache.get(gate_closure)
        if cached is not None:
            return cached

        days = [self.day_decision(d, gate_closure) for d in self.delivery_dates]
        scored_by_day = {day.delivery_date: _scored(day.points) for day in days}
        scored = [p for points in scored_by_day.values() for p in points]
        calibrated = [p for p in scored if p.calibrated_mw is not None]

        raw_metrics = _raw_metrics(scored)
        calibrated_metrics = _calibrated_metrics(scored)
        # Compare like with like: raw accuracy on exactly the hours that were calibrated.
        raw_on_calibrated = _raw_metrics(calibrated)
        mae_reduction = None
        if calibrated_metrics and raw_on_calibrated and raw_on_calibrated.mae_mw > 0:
            ratio = calibrated_metrics.mae_mw / raw_on_calibrated.mae_mw
            mae_reduction = round(100.0 * (1.0 - ratio), 1)

        band = None
        bands = [
            (p.lower_mw, p.upper_mw, p.actual_mw)
            for p in calibrated
            if p.lower_mw is not None and p.upper_mw is not None
        ]
        if bands:
            inside = sum(1 for lower, upper, actual in bands if lower <= actual <= upper)
            band = s.BandOut(
                target_coverage=self._settings.band_coverage,
                observed_coverage=round(inside / len(bands), 4),
                mean_width_mw=_mw(
                    math.fsum(upper - lower for lower, upper, _ in bands) / len(bands)
                ),
                count=len(bands),
            )

        raw_errors = [p.forecast_mw - p.actual_mw for p in scored]
        calibrated_errors = [
            p.calibrated_mw - p.actual_mw for p in scored if p.calibrated_mw is not None
        ]

        energy = None
        if scored:
            hours = HOURS_PER_FORECAST_STEP
            calibrated_values = [p.calibrated_mw for p in scored if p.calibrated_mw is not None]
            energy = s.EnergyOut(
                forecast_gwh=round(_energy_mwh((p.forecast_mw for p in scored), hours) / 1000, 3),
                calibrated_gwh=(
                    round(_energy_mwh(calibrated_values, hours) / 1000, 3)
                    if len(calibrated_values) == len(scored)
                    else None
                ),
                actual_gwh=round(_energy_mwh((p.actual_mw for p in scored), hours) / 1000, 3),
            )

        daily = [
            s.DailyAccuracyOut(
                delivery_date=delivery_date,
                forecast_energy_mwh=_mw(
                    _energy_mwh((p.forecast_mw for p in points), HOURS_PER_FORECAST_STEP)
                ),
                actual_energy_mwh=_mw(
                    _energy_mwh((p.actual_mw for p in points), HOURS_PER_FORECAST_STEP)
                ),
                **_segment(points),
            )
            for delivery_date, points in scored_by_day.items()
            if points
        ]
        by_hour = [
            s.HourAccuracyOut(hour=hour, **_segment(points))
            for hour, points in _group(
                scored, lambda p: p.start_time.astimezone(UK_TZ).hour
            ).items()
        ]
        by_level = [
            s.LevelAccuracyOut(
                lower_mw=index * LEVEL_BIN_MW,
                upper_mw=(index + 1) * LEVEL_BIN_MW,
                **_segment(points),
            )
            for index, points in _group(
                scored, lambda p: math.floor(p.forecast_mw / LEVEL_BIN_MW)
            ).items()
        ]

        raw_sorted = sorted(raw_errors)
        calibrated_sorted = sorted(calibrated_errors)
        buffers = (
            [
                s.BufferOut(
                    confidence=confidence,
                    raw_mw=_mw(percentile(raw_sorted, confidence)),
                    calibrated_mw=(
                        _mw(percentile(calibrated_sorted, confidence))
                        if calibrated_sorted
                        else None
                    ),
                )
                for confidence in BUFFER_CONFIDENCES
            ]
            if raw_sorted
            else []
        )

        leads = [p.lead_hours for p in scored]
        window = self.evaluation_window
        report = s.AccuracyOut(
            gate_closure=format_gate_closure(gate_closure),
            window=s.Interval(start=window.start, end=window.end),
            first_delivery_date=self._settings.first_delivery_date,
            last_delivery_date=self._settings.last_delivery_date,
            delivery_days=len(days),
            decision_lead_hours_min=round(min(leads), 2) if leads else None,
            decision_lead_hours_max=round(max(leads), 2) if leads else None,
            metrics=s.MetricsPair(
                raw=_metrics_out(raw_metrics), calibrated=_metrics_out(calibrated_metrics)
            ),
            mae_reduction_pct=mae_reduction,
            band=band,
            energy=energy,
            daily=daily,
            by_hour=by_hour,
            by_level=by_level,
            histogram_bin_width_mw=HISTOGRAM_BIN_MW,
            histogram=_histogram(raw_errors, calibrated_errors, HISTOGRAM_BIN_MW),
            by_lead=self.lead_curve(),
            buffers=buffers,
            scatter=[
                s.ScatterPointOut(
                    start_time=p.start_time,
                    forecast_mw=_mw(p.forecast_mw),
                    calibrated_mw=_opt_mw(p.calibrated_mw),
                    actual_mw=_mw(p.actual_mw),
                )
                for p in scored
            ],
        )
        self._accuracy_cache[gate_closure] = report
        return report
