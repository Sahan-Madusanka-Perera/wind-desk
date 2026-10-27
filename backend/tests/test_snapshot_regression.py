"""Guards for the bundled January 2026 snapshot and the headline numbers derived from it.

If the snapshot is refreshed or the methodology changes, these values must be reviewed
deliberately (they are quoted in the README and the client presentation).
"""

from datetime import date, time

import pytest

from app.config import Settings
from app.data.quality import check_quality
from app.data.repository import Dataset, load_snapshot
from app.domain.market import delivery_window
from app.services.analytics import ForecastAnalytics

N2EX_GATE_CLOSURE = time(9, 50)


@pytest.fixture(scope="module")
def real_settings() -> Settings:
    return Settings()


@pytest.fixture(scope="module")
def real_dataset(real_settings: Settings) -> Dataset:
    return load_snapshot(real_settings.snapshot_dir)


@pytest.fixture(scope="module")
def real_analytics(real_dataset: Dataset, real_settings: Settings) -> ForecastAnalytics:
    return ForecastAnalytics(real_dataset, real_settings)


def test_snapshot_is_complete_for_the_pilot(
    real_analytics: ForecastAnalytics, real_settings: Settings
) -> None:
    report = check_quality(
        real_analytics.book,
        real_analytics.actuals,
        start=delivery_window(real_settings.first_delivery_date).start,
        end=delivery_window(real_settings.last_delivery_date).end,
    )
    assert report.ok
    assert report.expected_settlement_periods == 31 * 48


def test_every_delivery_day_has_a_full_calibrated_decision_forecast(
    real_analytics: ForecastAnalytics,
) -> None:
    for delivery_date in real_analytics.delivery_dates:
        day = real_analytics.day_decision(delivery_date, N2EX_GATE_CLOSURE)
        assert len(day.points) == 24, delivery_date
        assert day.calibration is not None, delivery_date
        assert all(p.forecast.publish_time <= day.cutoff for p in day.points)
        assert all(p.actual_mw is not None for p in day.points)


def test_headline_accuracy_numbers(real_analytics: ForecastAnalytics) -> None:
    report = real_analytics.accuracy(N2EX_GATE_CLOSURE)
    raw = report.metrics.raw
    calibrated = report.metrics.calibrated
    assert raw is not None
    assert calibrated is not None
    assert report.delivery_days == 31
    assert raw.count == calibrated.count == 744
    assert raw.mae_mw == pytest.approx(1990.9, abs=0.1)
    assert raw.bias_mw == pytest.approx(1727.0, abs=0.1)
    assert calibrated.mae_mw == pytest.approx(1220.5, abs=0.1)
    assert report.mae_reduction_pct == pytest.approx(38.7, abs=0.1)
    assert report.band is not None
    assert report.band.observed_coverage == pytest.approx(0.80, abs=0.01)
    assert report.decision_lead_hours_min == 13.5
    assert report.decision_lead_hours_max == 36.5


def test_first_decision_of_january_is_trained_on_december_only(
    real_analytics: ForecastAnalytics,
) -> None:
    calibration = real_analytics.calibration(date(2026, 1, 2), N2EX_GATE_CLOSURE)
    assert calibration is not None
    assert calibration.training_days[0] == date(2025, 12, 18)
    assert calibration.training_days[-1] == date(2025, 12, 31)
