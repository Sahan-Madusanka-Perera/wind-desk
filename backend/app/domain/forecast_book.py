"""Indexed, read-only views over forecast runs and metered outturn.

The central question the product answers is *"what was the latest forecast available
at a given moment?"*. :class:`ForecastBook` answers it in ``O(log n)`` per target time by
keeping, for each target time, the publish times of every forecast run sorted ascending.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.domain.models import ActualRecord, ForecastRecord


@dataclass(frozen=True, slots=True)
class SelectedForecast:
    """A single forecast value together with when it was published."""

    start_time: datetime
    publish_time: datetime
    generation_mw: float

    @property
    def lead_hours(self) -> float:
        """How far ahead of the target time the forecast was published."""
        return (self.start_time - self.publish_time).total_seconds() / 3600.0


class ForecastBook:
    """All forecast runs, indexed both by target time and by publish time."""

    def __init__(self, records: Iterable[ForecastRecord]) -> None:
        # A later record for the same (target, publish) pair supersedes an earlier one.
        latest: dict[tuple[datetime, datetime], float] = {}
        for record in records:
            latest[(record.start_time, record.publish_time)] = record.generation_mw

        by_target: dict[datetime, list[tuple[datetime, float]]] = {}
        by_publish: dict[datetime, list[tuple[datetime, float]]] = {}
        for (start_time, publish_time), generation in latest.items():
            by_target.setdefault(start_time, []).append((publish_time, generation))
            by_publish.setdefault(publish_time, []).append((start_time, generation))

        self._publish_times_by_target: dict[datetime, list[datetime]] = {}
        self._values_by_target: dict[datetime, list[float]] = {}
        for start_time, runs in by_target.items():
            runs.sort()
            self._publish_times_by_target[start_time] = [publish for publish, _ in runs]
            self._values_by_target[start_time] = [value for _, value in runs]

        self._runs: dict[datetime, list[tuple[datetime, float]]] = {
            publish_time: sorted(values) for publish_time, values in by_publish.items()
        }
        self._target_times = sorted(by_target)
        self._publish_times = sorted(by_publish)
        self._record_count = len(latest)

    def __len__(self) -> int:
        return self._record_count

    @property
    def publish_times(self) -> list[datetime]:
        return list(self._publish_times)

    def target_times(self, start: datetime, end: datetime) -> list[datetime]:
        """Target times with at least one forecast, within ``[start, end)``."""
        return self._target_times[
            bisect_left(self._target_times, start) : bisect_left(self._target_times, end)
        ]

    def latest_as_of(self, start_time: datetime, as_of: datetime) -> SelectedForecast | None:
        """Most recent forecast for ``start_time`` published at or before ``as_of``."""
        publish_times = self._publish_times_by_target.get(start_time)
        if not publish_times:
            return None
        index = bisect_right(publish_times, as_of)
        if index == 0:
            return None
        return SelectedForecast(
            start_time=start_time,
            publish_time=publish_times[index - 1],
            generation_mw=self._values_by_target[start_time][index - 1],
        )

    def latest_with_min_lead(
        self, start_time: datetime, lead: timedelta
    ) -> SelectedForecast | None:
        """Most recent forecast published at least ``lead`` before ``start_time``."""
        return self.latest_as_of(start_time, start_time - lead)

    def first_publish_after(self, instant: datetime) -> datetime | None:
        index = bisect_right(self._publish_times, instant)
        return self._publish_times[index] if index < len(self._publish_times) else None

    def publish_times_between(self, start: datetime, end: datetime) -> list[datetime]:
        """Publish times within the closed interval ``[start, end]``."""
        return self._publish_times[
            bisect_left(self._publish_times, start) : bisect_right(self._publish_times, end)
        ]

    def run(
        self, publish_time: datetime, start: datetime, end: datetime
    ) -> list[tuple[datetime, float]]:
        """Values of the run published at ``publish_time`` for targets in ``[start, end)``."""
        return [
            (start_time, value)
            for start_time, value in self._runs.get(publish_time, [])
            if start <= start_time < end
        ]


class ActualSeries:
    """Metered outturn keyed by settlement-period start time."""

    def __init__(self, records: Iterable[ActualRecord]) -> None:
        # Keep the most recently published value if a period was ever restated.
        chosen: dict[datetime, ActualRecord] = {}
        for record in records:
            current = chosen.get(record.start_time)
            if current is None or record.publish_time >= current.publish_time:
                chosen[record.start_time] = record
        self._values = {start: record.generation_mw for start, record in chosen.items()}
        self._start_times = sorted(self._values)

    def __len__(self) -> int:
        return len(self._values)

    def get(self, start_time: datetime) -> float | None:
        return self._values.get(start_time)

    def between(self, start: datetime, end: datetime) -> list[tuple[datetime, float]]:
        """Outturn for settlement periods starting within ``[start, end)``, in time order."""
        lo = bisect_left(self._start_times, start)
        hi = bisect_left(self._start_times, end)
        return [(t, self._values[t]) for t in self._start_times[lo:hi]]

    @property
    def first_start(self) -> datetime | None:
        return self._start_times[0] if self._start_times else None

    @property
    def last_start(self) -> datetime | None:
        return self._start_times[-1] if self._start_times else None
