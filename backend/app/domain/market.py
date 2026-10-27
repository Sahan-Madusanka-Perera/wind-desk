"""GB day-ahead market conventions.

* Delivery day ``D`` of the GB day-ahead auctions runs from 23:00 UK time on ``D-1`` to
  23:00 UK time on ``D`` (Nord Pool GB Day-ahead Market Regulations, s.2.2.6: "Each
  Day-ahead Price Calculation relates to the following day starting from 23:00 UK time").
* Orders for delivery day ``D`` must be submitted before gate closure on ``D-1``:
  09:50 UK time for the Nord Pool N2EX hourly auction, 09:20 UK time for the EPEX SPOT GB
  hourly auction.

All functions accept and return timezone-aware UTC datetimes; conversion to UK local time
(GMT/BST) is handled here so that clock changes are always respected.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")
SETTLEMENT_PERIOD = timedelta(minutes=30)
DELIVERY_DAY_START = time(23, 0)

_GATE_CLOSURE_PATTERN = re.compile(r"^(?P<hour>[01]\d|2[0-3]):(?P<minute>[0-5]\d)$")


@dataclass(frozen=True, slots=True)
class GateClosurePreset:
    id: str
    label: str
    time: time


GATE_CLOSURE_PRESETS: tuple[GateClosurePreset, ...] = (
    GateClosurePreset("n2ex", "Nord Pool N2EX day-ahead auction", time(9, 50)),
    GateClosurePreset("epex", "EPEX SPOT GB day-ahead auction", time(9, 20)),
)


@dataclass(frozen=True, slots=True)
class DeliveryWindow:
    """Half-open UTC interval ``[start, end)`` covered by one delivery day."""

    delivery_date: date
    start: datetime
    end: datetime

    def contains(self, instant: datetime) -> bool:
        return self.start <= instant < self.end

    @property
    def duration(self) -> timedelta:
        return self.end - self.start


def _uk_local_to_utc(day: date, clock_time: time) -> datetime:
    return datetime.combine(day, clock_time, tzinfo=UK_TZ).astimezone(UTC)


def delivery_window(delivery_date: date) -> DeliveryWindow:
    """UTC interval of GB day-ahead delivery day ``delivery_date``.

    23 or 25 hours long on clock-change days, 24 hours otherwise.
    """
    return DeliveryWindow(
        delivery_date=delivery_date,
        start=_uk_local_to_utc(delivery_date - timedelta(days=1), DELIVERY_DAY_START),
        end=_uk_local_to_utc(delivery_date, DELIVERY_DAY_START),
    )


def decision_cutoff(delivery_date: date, gate_closure: time) -> datetime:
    """Instant on ``D-1`` by which the purchase decision for ``delivery_date`` is made."""
    validate_gate_closure(gate_closure)
    return _uk_local_to_utc(delivery_date - timedelta(days=1), gate_closure)


def delivery_date_for(instant: datetime) -> date:
    """Delivery day that the UTC ``instant`` belongs to."""
    local = instant.astimezone(UK_TZ)
    if local.time() >= DELIVERY_DAY_START:
        return local.date() + timedelta(days=1)
    return local.date()


def validate_gate_closure(gate_closure: time) -> None:
    """A decision must be taken before the delivery day starts (23:00 UK on D-1)."""
    if gate_closure >= DELIVERY_DAY_START:
        raise ValueError("Gate closure must be before 23:00 UK time on the day before delivery")


def parse_gate_closure(value: str) -> time:
    """Parse an ``HH:MM`` UK clock time and check it is a valid decision time."""
    match = _GATE_CLOSURE_PATTERN.match(value)
    if match is None:
        raise ValueError("Gate closure must be a 24-hour UK clock time formatted as HH:MM")
    parsed = time(int(match["hour"]), int(match["minute"]))
    validate_gate_closure(parsed)
    return parsed


def format_gate_closure(gate_closure: time) -> str:
    return gate_closure.strftime("%H:%M")


def iter_dates(first: date, last: date) -> list[date]:
    """Inclusive list of calendar dates from ``first`` to ``last``."""
    return [first + timedelta(days=offset) for offset in range((last - first).days + 1)]
