"""Core data records. All datetimes are timezone-aware and expressed in UTC."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True, slots=True)
class ForecastRecord:
    """One value of a WINDFOR forecast run: the MW expected at ``start_time``."""

    publish_time: datetime
    start_time: datetime
    generation_mw: float


@dataclass(frozen=True, slots=True)
class ActualRecord:
    """Metered wind outturn (FUELHH, fuel type WIND) for one 30-minute settlement period."""

    start_time: datetime
    generation_mw: float
    settlement_date: date
    settlement_period: int
    publish_time: datetime
