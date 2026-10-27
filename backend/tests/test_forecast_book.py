from datetime import date, timedelta

from app.domain.forecast_book import ActualSeries, ForecastBook
from app.domain.models import ActualRecord, ForecastRecord
from tests.conftest import utc

TARGET = utc(2026, 1, 15, 12)


def _book() -> ForecastBook:
    return ForecastBook(
        [
            ForecastRecord(utc(2026, 1, 14, 3, 30), TARGET, 100.0),
            ForecastRecord(utc(2026, 1, 14, 9, 30), TARGET, 200.0),
            ForecastRecord(utc(2026, 1, 14, 15, 30), TARGET, 300.0),
            ForecastRecord(utc(2026, 1, 14, 9, 30), TARGET + timedelta(hours=1), 210.0),
        ]
    )


def test_latest_as_of_returns_most_recent_run_published_before_cutoff() -> None:
    selected = _book().latest_as_of(TARGET, utc(2026, 1, 14, 9, 50))
    assert selected is not None
    assert selected.publish_time == utc(2026, 1, 14, 9, 30)
    assert selected.generation_mw == 200.0
    assert selected.lead_hours == 26.5


def test_latest_as_of_includes_run_published_exactly_at_cutoff() -> None:
    selected = _book().latest_as_of(TARGET, utc(2026, 1, 14, 15, 30))
    assert selected is not None
    assert selected.generation_mw == 300.0


def test_latest_as_of_is_none_before_first_run_or_for_unknown_target() -> None:
    book = _book()
    assert book.latest_as_of(TARGET, utc(2026, 1, 14, 3, 29)) is None
    assert book.latest_as_of(utc(2030, 1, 1), utc(2030, 1, 1)) is None


def test_latest_with_min_lead() -> None:
    book = _book()
    selected = book.latest_with_min_lead(TARGET, timedelta(hours=27))
    assert selected is not None
    assert selected.publish_time == utc(2026, 1, 14, 3, 30)
    assert book.latest_with_min_lead(TARGET, timedelta(hours=40)) is None


def test_duplicate_records_are_superseded_by_the_last_one() -> None:
    publish = utc(2026, 1, 14, 9, 30)
    book = ForecastBook(
        [ForecastRecord(publish, TARGET, 1.0), ForecastRecord(publish, TARGET, 2.0)]
    )
    assert len(book) == 1
    selected = book.latest_as_of(TARGET, publish)
    assert selected is not None
    assert selected.generation_mw == 2.0


def test_index_queries() -> None:
    book = _book()
    assert book.target_times(TARGET, TARGET + timedelta(hours=1)) == [TARGET]
    assert book.publish_times == [
        utc(2026, 1, 14, 3, 30),
        utc(2026, 1, 14, 9, 30),
        utc(2026, 1, 14, 15, 30),
    ]
    assert book.first_publish_after(utc(2026, 1, 14, 9, 30)) == utc(2026, 1, 14, 15, 30)
    assert book.first_publish_after(utc(2026, 1, 14, 15, 30)) is None
    assert book.publish_times_between(utc(2026, 1, 14, 3, 30), utc(2026, 1, 14, 9, 30)) == [
        utc(2026, 1, 14, 3, 30),
        utc(2026, 1, 14, 9, 30),
    ]
    assert book.run(utc(2026, 1, 14, 9, 30), TARGET, TARGET + timedelta(hours=2)) == [
        (TARGET, 200.0),
        (TARGET + timedelta(hours=1), 210.0),
    ]
    assert book.run(utc(2026, 1, 14, 9, 30), TARGET, TARGET + timedelta(hours=1)) == [
        (TARGET, 200.0)
    ]


def _actual(start: int, value: float, published: int) -> ActualRecord:
    return ActualRecord(
        start_time=utc(2026, 1, 15, start),
        generation_mw=value,
        settlement_date=date(2026, 1, 15),
        settlement_period=start * 2 + 1,
        publish_time=utc(2026, 1, 15, published),
    )


def test_actual_series_keeps_latest_restatement_and_half_open_ranges() -> None:
    series = ActualSeries([_actual(1, 10.0, 2), _actual(1, 11.0, 5), _actual(2, 20.0, 3)])
    assert len(series) == 2
    assert series.get(utc(2026, 1, 15, 1)) == 11.0
    assert series.get(utc(2026, 1, 15, 3)) is None
    assert series.between(utc(2026, 1, 15, 1), utc(2026, 1, 15, 2)) == [(utc(2026, 1, 15, 1), 11.0)]
    assert series.first_start == utc(2026, 1, 15, 1)
    assert series.last_start == utc(2026, 1, 15, 2)
    assert ActualSeries([]).first_start is None
