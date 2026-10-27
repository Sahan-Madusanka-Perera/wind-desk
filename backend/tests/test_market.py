from datetime import date, time, timedelta

import pytest

from app.domain.market import (
    decision_cutoff,
    delivery_date_for,
    delivery_window,
    iter_dates,
    parse_gate_closure,
)
from tests.conftest import utc


def test_winter_delivery_day_runs_23_00_to_23_00_gmt() -> None:
    window = delivery_window(date(2026, 1, 15))
    assert window.start == utc(2026, 1, 14, 23)
    assert window.end == utc(2026, 1, 15, 23)
    assert window.duration == timedelta(hours=24)


def test_summer_delivery_day_is_shifted_by_bst() -> None:
    window = delivery_window(date(2026, 7, 15))
    assert window.start == utc(2026, 7, 14, 22)
    assert window.end == utc(2026, 7, 15, 22)


@pytest.mark.parametrize(
    ("delivery_date", "hours"),
    [(date(2026, 3, 29), 23), (date(2026, 10, 25), 25)],
    ids=["clocks-forward", "clocks-back"],
)
def test_clock_change_days_are_short_or_long(delivery_date: date, hours: int) -> None:
    assert delivery_window(delivery_date).duration == timedelta(hours=hours)


def test_window_is_half_open() -> None:
    window = delivery_window(date(2026, 1, 15))
    assert window.contains(utc(2026, 1, 14, 23))
    assert window.contains(utc(2026, 1, 15, 22, 30))
    assert not window.contains(utc(2026, 1, 15, 23))


def test_decision_cutoff_is_gate_closure_on_previous_uk_day() -> None:
    assert decision_cutoff(date(2026, 1, 15), time(9, 50)) == utc(2026, 1, 14, 9, 50)
    assert decision_cutoff(date(2026, 7, 15), time(9, 50)) == utc(2026, 7, 14, 8, 50)


def test_decision_cutoff_rejects_gate_closure_after_delivery_start() -> None:
    with pytest.raises(ValueError, match="before 23:00"):
        decision_cutoff(date(2026, 1, 15), time(23, 0))


def test_delivery_date_for_instant() -> None:
    assert delivery_date_for(utc(2026, 1, 14, 22, 30)) == date(2026, 1, 14)
    assert delivery_date_for(utc(2026, 1, 14, 23)) == date(2026, 1, 15)
    assert delivery_date_for(utc(2026, 7, 14, 22)) == date(2026, 7, 15)


@pytest.mark.parametrize(
    ("raw", "expected"), [("09:50", time(9, 50)), ("00:00", time(0, 0)), ("22:59", time(22, 59))]
)
def test_parse_gate_closure_accepts_valid_times(raw: str, expected: time) -> None:
    assert parse_gate_closure(raw) == expected


@pytest.mark.parametrize("raw", ["9:50", "24:00", "09:60", "ab:cd", "", "09:50:00"])
def test_parse_gate_closure_rejects_malformed_times(raw: str) -> None:
    with pytest.raises(ValueError, match="HH:MM"):
        parse_gate_closure(raw)


@pytest.mark.parametrize("raw", ["23:00", "23:59"])
def test_parse_gate_closure_rejects_times_after_delivery_start(raw: str) -> None:
    with pytest.raises(ValueError, match="before 23:00"):
        parse_gate_closure(raw)


def test_iter_dates_is_inclusive() -> None:
    assert iter_dates(date(2026, 1, 30), date(2026, 2, 1)) == [
        date(2026, 1, 30),
        date(2026, 1, 31),
        date(2026, 2, 1),
    ]
    assert iter_dates(date(2026, 1, 2), date(2026, 1, 1)) == []
