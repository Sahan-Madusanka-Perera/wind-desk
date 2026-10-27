"""Shared fixtures: a small, fully deterministic synthetic market.

The synthetic forecast is a known linear distortion of the outturn
(``forecast = 1.25 * actual + 400 + small run-specific offset``), so tests can assert
exact or near-exact behaviour of selection, metrics and calibration.
"""

from __future__ import annotations

import math
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.data.repository import Dataset, IngestionWindows, Provenance
from app.domain.models import ActualRecord, ForecastRecord
from app.main import create_app

HOUR = timedelta(hours=1)
HALF_HOUR = timedelta(minutes=30)
RUN_TIMES = ((3, 30), (9, 30), (15, 30), (21, 30))
FORECAST_SLOPE = 1.25
FORECAST_OFFSET_MW = 400.0


def utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


def synthetic_actual(instant: datetime) -> float:
    hours = (instant - utc(2026, 1, 1)).total_seconds() / 3600
    return round(8000 + 3000 * math.sin(2 * math.pi * hours / 24) + 500 * math.sin(hours / 7), 1)


def run_offset(publish_time: datetime) -> float:
    """Small, run-specific perturbation so that successive runs differ."""
    return float((publish_time.hour % 7) * 10)


def synthetic_forecast(target: datetime, publish_time: datetime) -> float:
    return round(
        FORECAST_SLOPE * synthetic_actual(target) + FORECAST_OFFSET_MW + run_offset(publish_time), 1
    )


def build_dataset(first_day: date, last_day: date) -> Dataset:
    """Half-hourly outturn and four hourly forecast runs per day between the given days."""
    start = datetime.combine(first_day, datetime.min.time(), tzinfo=UTC)
    end = datetime.combine(last_day + timedelta(days=1), datetime.min.time(), tzinfo=UTC)

    actuals: list[ActualRecord] = []
    cursor = start
    while cursor < end:
        period = int((cursor - cursor.replace(hour=0, minute=0)) / HALF_HOUR) + 1
        actuals.append(
            ActualRecord(
                start_time=cursor,
                generation_mw=synthetic_actual(cursor),
                settlement_date=cursor.date(),
                settlement_period=period,
                publish_time=cursor + HALF_HOUR,
            )
        )
        cursor += HALF_HOUR

    forecasts: list[ForecastRecord] = []
    day = first_day
    while day <= last_day:
        for hour, minute in RUN_TIMES:
            publish = datetime.combine(day, datetime.min.time(), tzinfo=UTC).replace(
                hour=hour, minute=minute
            )
            target = publish.replace(minute=0) - 3 * HOUR
            while target <= publish + 48 * HOUR:
                forecasts.append(
                    ForecastRecord(
                        publish_time=publish,
                        start_time=target,
                        generation_mw=synthetic_forecast(target, publish),
                    )
                )
                target += HOUR
        day += timedelta(days=1)

    return Dataset(
        forecasts=tuple(forecasts),
        actuals=tuple(actuals),
        provenance=Provenance(
            source="snapshot",
            fetched_at=utc(2026, 2, 2),
            windows=IngestionWindows(
                forecast_publish_from=start,
                forecast_publish_to=end,
                actual_settlement_from=first_day,
                actual_settlement_to=last_day,
            ),
        ),
    )


@pytest.fixture
def settings() -> Settings:
    """Two delivery days (11 and 12 Jan 2026) with a three-day calibration window."""
    return Settings(
        first_decision_date=date(2026, 1, 10),
        last_decision_date=date(2026, 1, 11),
        calibration_window_days=3,
        calibration_min_points=24,
    )


@pytest.fixture
def dataset() -> Dataset:
    return build_dataset(date(2026, 1, 1), date(2026, 1, 13))


@pytest.fixture
def client(settings: Settings, dataset: Dataset) -> Iterator[TestClient]:
    app = create_app(settings, dataset_loader=lambda _: dataset)
    with TestClient(app) as test_client:
        yield test_client
