from dataclasses import replace
from datetime import date, time

import pytest

from app.config import Settings
from app.data.repository import Dataset
from app.domain.market import decision_cutoff
from app.services.analytics import DecisionPoint, ForecastAnalytics, InvalidRequestError
from tests.conftest import synthetic_actual, utc

GATE = time(9, 50)
DELIVERY = date(2026, 1, 11)


@pytest.fixture
def analytics(dataset: Dataset, settings: Settings) -> ForecastAnalytics:
    return ForecastAnalytics(dataset, settings)


def test_decision_forecast_uses_latest_run_published_before_gate_closure(
    analytics: ForecastAnalytics,
) -> None:
    forecasts = analytics.raw_decision_forecasts(DELIVERY, GATE)
    assert len(forecasts) == 24
    assert {f.publish_time for f in forecasts} == {utc(2026, 1, 10, 9, 30)}
    assert forecasts[0].start_time == utc(2026, 1, 10, 23)
    assert forecasts[-1].start_time == utc(2026, 1, 11, 22)


def test_an_earlier_gate_closure_falls_back_to_the_previous_run(
    analytics: ForecastAnalytics,
) -> None:
    forecasts = analytics.raw_decision_forecasts(DELIVERY, time(9, 20))
    assert {f.publish_time for f in forecasts} == {utc(2026, 1, 10, 3, 30)}


def test_training_days_are_the_settled_days_before_the_decision(
    analytics: ForecastAnalytics,
) -> None:
    # Delivery day D-1 is still in progress at gate closure, so training ends at D-2.
    assert analytics.training_days(DELIVERY, GATE) == [
        date(2026, 1, 7),
        date(2026, 1, 8),
        date(2026, 1, 9),
    ]


def test_calibration_recovers_the_synthetic_distortion(analytics: ForecastAnalytics) -> None:
    calibration = analytics.calibration(DELIVERY, GATE)
    assert calibration is not None
    # forecast = 1.25 * actual + 420 for the 09:30 run  =>  actual = 0.8 * forecast - 336
    assert calibration.slope == pytest.approx(0.8, abs=1e-3)
    assert calibration.intercept_mw == pytest.approx(-336, abs=2)
    assert calibration.training_points == 72


def test_decision_uses_no_information_published_after_gate_closure(
    dataset: Dataset, settings: Settings
) -> None:
    """Changing anything published after the cutoff must not change the decision view."""
    cutoff = decision_cutoff(DELIVERY, GATE)
    tampered = Dataset(
        forecasts=tuple(
            replace(r, generation_mw=r.generation_mw + 9999) if r.publish_time > cutoff else r
            for r in dataset.forecasts
        ),
        actuals=tuple(
            replace(r, generation_mw=r.generation_mw + 5000) if r.publish_time > cutoff else r
            for r in dataset.actuals
        ),
        provenance=dataset.provenance,
    )
    original = ForecastAnalytics(dataset, settings).day_decision(DELIVERY, GATE)
    altered = ForecastAnalytics(tampered, settings).day_decision(DELIVERY, GATE)

    def decision_view(points: tuple[DecisionPoint, ...]) -> list[tuple[object, ...]]:
        return [(p.forecast, p.calibrated_mw, p.lower_mw, p.upper_mw) for p in points]

    assert decision_view(original.points) == decision_view(altered.points)
    assert original.calibration == altered.calibration


def test_calibration_is_unavailable_without_enough_history(dataset: Dataset) -> None:
    strict = Settings(
        first_decision_date=date(2026, 1, 10),
        last_decision_date=date(2026, 1, 11),
        calibration_window_days=3,
        calibration_min_points=500,
    )
    analytics = ForecastAnalytics(dataset, strict)
    assert analytics.calibration(DELIVERY, GATE) is None
    briefing = analytics.briefing(DELIVERY, GATE)
    assert briefing.calibration is None
    assert all(p.calibrated_mw is None for p in briefing.points)
    assert briefing.metrics.calibrated is None
    assert briefing.summary is not None
    assert briefing.summary.calibrated_energy_mwh is None


def test_briefing(analytics: ForecastAnalytics) -> None:
    briefing = analytics.briefing(DELIVERY, GATE)
    assert briefing.decision_date == date(2026, 1, 10)
    assert briefing.decision_cutoff == utc(2026, 1, 10, 9, 50)
    assert briefing.forecast_publish_time == utc(2026, 1, 10, 9, 30)
    assert briefing.next_publish_time == utc(2026, 1, 10, 15, 30)
    assert briefing.expected_points == 24
    assert len(briefing.points) == 24
    assert len(briefing.actuals) == 48
    assert briefing.lead_hours_min == 13.5
    assert briefing.lead_hours_max == 36.5

    summary = briefing.summary
    assert summary is not None
    assert summary.forecast_energy_mwh == pytest.approx(sum(p.forecast_mw for p in briefing.points))
    expected_actual = sum(synthetic_actual(a.start_time) for a in briefing.actuals) * 0.5
    assert summary.actual_energy_mwh == pytest.approx(expected_actual, abs=0.1)
    assert summary.dependable_energy_mwh is not None
    assert summary.calibrated_energy_mwh is not None
    assert summary.dependable_energy_mwh <= summary.calibrated_energy_mwh
    assert summary.forecast_peak_mw == max(p.forecast_mw for p in briefing.points)

    for point in briefing.points:
        assert point.lower_mw is not None
        assert point.upper_mw is not None
        assert point.lower_mw <= point.upper_mw

    used = [v for v in briefing.vintages if v.used_for_decision]
    assert [v.publish_time for v in used] == [utc(2026, 1, 10, 9, 30)]
    for vintage in briefing.vintages:
        assert vintage.available_at_decision == (vintage.publish_time <= briefing.decision_cutoff)
        assert vintage.publish_time <= briefing.window.start

    assert briefing.metrics.raw is not None
    assert briefing.metrics.calibrated is not None
    assert briefing.metrics.calibrated.mae_mw < briefing.metrics.raw.mae_mw


def test_briefing_rejects_dates_outside_the_pilot(analytics: ForecastAnalytics) -> None:
    with pytest.raises(InvalidRequestError, match="between 2026-01-11 and 2026-01-12"):
        analytics.briefing(date(2026, 1, 13), GATE)


def test_timeseries_decision_mode_spans_whole_delivery_days(analytics: ForecastAnalytics) -> None:
    series = analytics.timeseries(
        date(2026, 1, 11), date(2026, 1, 12), mode="decision", gate_closure=GATE, lead_hours=0
    )
    assert series.window.start == utc(2026, 1, 10, 23)
    assert series.window.end == utc(2026, 1, 12, 23)
    assert len(series.points) == 48
    assert len(series.actuals) == 96
    assert series.gate_closure == "09:50"
    assert series.lead_hours is None
    assert {p.publish_time for p in series.points} == {
        utc(2026, 1, 10, 9, 30),
        utc(2026, 1, 11, 9, 30),
    }


def test_timeseries_lead_mode_respects_minimum_lead(analytics: ForecastAnalytics) -> None:
    series = analytics.timeseries(
        date(2026, 1, 11), date(2026, 1, 11), mode="lead", gate_closure=GATE, lead_hours=8
    )
    assert series.gate_closure is None
    assert series.lead_hours == 8
    assert len(series.points) == 24
    assert all(p.lead_hours >= 8 for p in series.points)
    assert all(p.calibrated_mw is None for p in series.points)
    assert series.metrics.calibrated is None


@pytest.mark.parametrize(
    ("from_date", "to_date", "lead", "message"),
    [
        (date(2026, 1, 12), date(2026, 1, 11), 4, "must not be before"),
        (date(2026, 1, 11), date(2026, 1, 11), 49, "Lead time"),
        (date(2026, 1, 1), date(2026, 1, 11), 4, "Delivery date"),
    ],
)
def test_timeseries_validation(
    analytics: ForecastAnalytics, from_date: date, to_date: date, lead: int, message: str
) -> None:
    with pytest.raises(InvalidRequestError, match=message):
        analytics.timeseries(from_date, to_date, mode="lead", gate_closure=GATE, lead_hours=lead)


def test_accuracy_report(analytics: ForecastAnalytics) -> None:
    report = analytics.accuracy(GATE)
    assert report.delivery_days == 2
    assert report.metrics.raw is not None
    assert report.metrics.raw.count == 48
    assert report.metrics.raw.bias_mw > 0  # the synthetic forecast over-forecasts
    assert report.metrics.calibrated is not None
    assert report.metrics.calibrated.mae_mw < 1.0
    assert report.mae_reduction_pct is not None
    assert report.mae_reduction_pct > 99
    assert report.band is not None
    assert report.band.count == 48
    assert 0.0 <= report.band.observed_coverage <= 1.0
    assert report.energy is not None
    assert report.energy.forecast_gwh > report.energy.actual_gwh

    assert [d.delivery_date for d in report.daily] == [date(2026, 1, 11), date(2026, 1, 12)]
    assert sum(h.count for h in report.by_hour) == 48
    assert sorted(h.hour for h in report.by_hour) == list(range(24))
    assert sum(b.count for b in report.by_level) == 48
    assert all(b.upper_mw - b.lower_mw == 3000 for b in report.by_level)
    assert sum(b.raw_count for b in report.histogram) == 48
    assert sum(b.calibrated_count for b in report.histogram) == 48
    assert len(report.scatter) == 48

    leads = [bucket.lead_hours for bucket in report.by_lead]
    assert leads == sorted(leads)
    assert leads[0] == 0
    assert all(bucket.count > 0 for bucket in report.by_lead)

    raw_buffers = [b.raw_mw for b in report.buffers]
    assert raw_buffers == sorted(raw_buffers)
    assert analytics.accuracy(GATE) is report  # memoised


def test_meta_and_health(analytics: ForecastAnalytics) -> None:
    meta = analytics.meta()
    assert meta.first_delivery_date == date(2026, 1, 11)
    assert meta.last_delivery_date == date(2026, 1, 12)
    assert meta.default_gate_closure == "09:50"
    assert {p.time for p in meta.gate_closure_presets} == {"09:50", "09:20"}
    assert meta.data.forecast_runs == 13 * 4
    assert meta.data.actual_records == 13 * 48
    assert analytics.health().status == "ok"
