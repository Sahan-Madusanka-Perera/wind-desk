from app.data.quality import check_quality
from app.data.repository import Dataset
from app.domain.forecast_book import ActualSeries, ForecastBook
from tests.conftest import utc


def test_complete_data_passes(dataset: Dataset) -> None:
    report = check_quality(
        ForecastBook(dataset.forecasts),
        ActualSeries(dataset.actuals),
        start=utc(2026, 1, 5),
        end=utc(2026, 1, 6),
    )
    assert report.ok
    assert report.expected_settlement_periods == 48


def test_gaps_are_reported(dataset: Dataset) -> None:
    missing_period = utc(2026, 1, 5, 10)
    actuals = [r for r in dataset.actuals if r.start_time != missing_period]
    forecasts = [r for r in dataset.forecasts if r.start_time != utc(2026, 1, 5, 11)]
    report = check_quality(
        ForecastBook(forecasts),
        ActualSeries(actuals),
        start=utc(2026, 1, 5),
        end=utc(2026, 1, 6),
        negative_values=1,
    )
    assert not report.ok
    assert report.missing_settlement_periods == [missing_period]
    assert report.targets_without_forecast == [utc(2026, 1, 5, 11)]
    assert report.negative_values == 1
