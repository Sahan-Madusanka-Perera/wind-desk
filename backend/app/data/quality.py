"""Data-quality checks run at ingestion time, so problems surface before they reach users."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.domain.forecast_book import ActualSeries, ForecastBook
from app.domain.market import SETTLEMENT_PERIOD


@dataclass(frozen=True, slots=True)
class QualityReport:
    forecast_records: int
    forecast_runs: int
    actual_records: int
    expected_settlement_periods: int
    missing_settlement_periods: list[datetime] = field(default_factory=list)
    negative_values: int = 0
    targets_without_forecast: list[datetime] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return (
            self.forecast_records > 0
            and self.actual_records > 0
            and not self.missing_settlement_periods
            and not self.targets_without_forecast
            and self.negative_values == 0
        )


def check_quality(
    book: ForecastBook,
    actuals: ActualSeries,
    *,
    start: datetime,
    end: datetime,
    negative_values: int = 0,
) -> QualityReport:
    """Completeness of outturn and forecast coverage over the evaluation window ``[start, end)``."""
    expected: list[datetime] = []
    cursor = start
    while cursor < end:
        expected.append(cursor)
        cursor += SETTLEMENT_PERIOD

    missing = [t for t in expected if actuals.get(t) is None]
    # Forecasts are hourly: every on-the-hour settlement period should have a forecast.
    hourly_targets = [t for t in expected if t.minute == 0]
    covered = set(book.target_times(start, end))
    targets_without_forecast = [t for t in hourly_targets if t not in covered]

    return QualityReport(
        forecast_records=len(book),
        forecast_runs=len(book.publish_times),
        actual_records=len(actuals),
        expected_settlement_periods=len(expected),
        missing_settlement_periods=missing,
        negative_values=negative_values,
        targets_without_forecast=targets_without_forecast,
    )
