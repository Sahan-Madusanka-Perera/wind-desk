"""Minimal client for the Elexon Insights Solution (BMRS) stream endpoints we rely on.

* ``WINDFOR`` - wind generation forecast runs, filtered by publish time.
* ``FUELHH``  - half-hourly generation outturn by fuel type, filtered to ``WIND``.

Requests are split into fixed-size chunks and retried with exponential back-off on
throttling (HTTP 429), server errors and network failures.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Iterator, Mapping
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, TypeAdapter, ValidationError

from app.domain.models import ActualRecord, ForecastRecord

logger = logging.getLogger(__name__)

WINDFOR_PATH = "/datasets/WINDFOR/stream"
FUELHH_PATH = "/datasets/FUELHH/stream"
WIND_FUEL_TYPE = "WIND"

_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})


class ElexonError(RuntimeError):
    """Raised when Elexon data cannot be retrieved or does not match the expected schema."""


class _WindForRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    publishTime: datetime  # noqa: N815 - mirrors the Elexon payload
    startTime: datetime  # noqa: N815
    generation: float


class _FuelHHRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    publishTime: datetime  # noqa: N815
    startTime: datetime  # noqa: N815
    settlementDate: date  # noqa: N815
    settlementPeriod: int  # noqa: N815
    fuelType: str  # noqa: N815
    generation: float


_WINDFOR_ROWS = TypeAdapter(list[_WindForRow])
_FUELHH_ROWS = TypeAdapter(list[_FuelHHRow])


def _iso_utc(instant: datetime) -> str:
    return instant.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _as_utc(instant: datetime) -> datetime:
    if instant.tzinfo is None:
        raise ElexonError(f"Elexon returned a timestamp without a timezone: {instant!r}")
    return instant.astimezone(UTC)


def _datetime_chunks(
    start: datetime, end: datetime, size: timedelta
) -> Iterator[tuple[datetime, datetime]]:
    cursor = start
    while cursor < end:
        upper = min(cursor + size, end)
        yield cursor, upper
        cursor = upper


def _date_chunks(first: date, last: date, days: int) -> Iterator[tuple[date, date]]:
    cursor = first
    while cursor <= last:
        upper = min(cursor + timedelta(days=days - 1), last)
        yield cursor, upper
        cursor = upper + timedelta(days=1)


class ElexonClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout_seconds: float = 30.0,
        max_attempts: int = 4,
        backoff_seconds: float = 1.0,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout_seconds,
            transport=transport,
            headers={"Accept": "application/json"},
        )
        self._max_attempts = max_attempts
        self._backoff_seconds = backoff_seconds
        self._sleep = sleep

    def __enter__(self) -> ElexonClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    # ---------------------------------------------------------------- public API

    def fetch_wind_forecasts(
        self,
        publish_from: datetime,
        publish_to: datetime,
        *,
        chunk: timedelta = timedelta(days=7),
    ) -> list[ForecastRecord]:
        """Every WINDFOR value from runs published within ``[publish_from, publish_to]``."""
        records: dict[tuple[datetime, datetime], ForecastRecord] = {}
        for lower, upper in _datetime_chunks(publish_from, publish_to, chunk):
            payload = self._get_json(
                WINDFOR_PATH,
                {"publishDateTimeFrom": _iso_utc(lower), "publishDateTimeTo": _iso_utc(upper)},
            )
            for row in self._parse(_WINDFOR_ROWS, payload, "WINDFOR"):
                record = ForecastRecord(
                    publish_time=_as_utc(row.publishTime),
                    start_time=_as_utc(row.startTime),
                    generation_mw=row.generation,
                )
                if publish_from <= record.publish_time <= publish_to:
                    records[(record.start_time, record.publish_time)] = record
        return sorted(records.values(), key=lambda r: (r.publish_time, r.start_time))

    def fetch_wind_outturn(
        self, settlement_from: date, settlement_to: date, *, chunk_days: int = 7
    ) -> list[ActualRecord]:
        """Half-hourly metered wind generation for settlement dates in the inclusive range."""
        records: dict[datetime, ActualRecord] = {}
        for lower, upper in _date_chunks(settlement_from, settlement_to, chunk_days):
            payload = self._get_json(
                FUELHH_PATH,
                {
                    "settlementDateFrom": lower.isoformat(),
                    "settlementDateTo": upper.isoformat(),
                    "fuelType": WIND_FUEL_TYPE,
                },
            )
            for row in self._parse(_FUELHH_ROWS, payload, "FUELHH"):
                if row.fuelType != WIND_FUEL_TYPE:
                    continue
                record = ActualRecord(
                    start_time=_as_utc(row.startTime),
                    generation_mw=row.generation,
                    settlement_date=row.settlementDate,
                    settlement_period=row.settlementPeriod,
                    publish_time=_as_utc(row.publishTime),
                )
                current = records.get(record.start_time)
                if current is None or record.publish_time >= current.publish_time:
                    records[record.start_time] = record
        return sorted(records.values(), key=lambda r: r.start_time)

    # ---------------------------------------------------------------- internals

    @staticmethod
    def _parse(adapter: TypeAdapter[list[Any]], payload: Any, dataset: str) -> list[Any]:
        try:
            return adapter.validate_python(payload)
        except ValidationError as exc:
            raise ElexonError(f"Unexpected {dataset} payload from Elexon: {exc}") from exc

    def _get_json(self, path: str, params: Mapping[str, str]) -> Any:
        last_error: str = "no attempt made"
        for attempt in range(1, self._max_attempts + 1):
            try:
                response = self._client.get(path, params=params)
            except httpx.TransportError as exc:
                last_error = f"network error: {exc}"
            else:
                if response.status_code == 200:
                    try:
                        return response.json()
                    except ValueError as exc:
                        raise ElexonError(f"Elexon returned invalid JSON for {path}") from exc
                if response.status_code not in _RETRYABLE_STATUS:
                    raise ElexonError(
                        f"Elexon request {path} failed with HTTP {response.status_code}: "
                        f"{response.text[:300]}"
                    )
                last_error = f"HTTP {response.status_code}"

            if attempt < self._max_attempts:
                delay = self._backoff_seconds * 2 ** (attempt - 1)
                logger.warning(
                    "Elexon request %s failed (%s); retry %d/%d in %.1fs",
                    path,
                    last_error,
                    attempt,
                    self._max_attempts - 1,
                    delay,
                )
                self._sleep(delay)

        raise ElexonError(
            f"Elexon request {path} failed after {self._max_attempts} attempts ({last_error})"
        )
