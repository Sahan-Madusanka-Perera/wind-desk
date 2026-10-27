from collections.abc import Callable
from datetime import date, timedelta

import httpx
import pytest

from app.data.elexon_client import FUELHH_PATH, WINDFOR_PATH, ElexonClient, ElexonError
from tests.conftest import utc

BASE_URL = "https://elexon.test/bmrs/api/v1"

Handler = Callable[[httpx.Request], httpx.Response]


def _client(handler: Handler, sleeps: list[float] | None = None) -> ElexonClient:
    recorded = sleeps if sleeps is not None else []
    return ElexonClient(
        BASE_URL,
        transport=httpx.MockTransport(handler),
        max_attempts=3,
        backoff_seconds=0.5,
        sleep=recorded.append,
    )


def _windfor_row(publish: str, start: str, generation: float) -> dict[str, object]:
    return {
        "dataset": "WINDFOR",
        "publishTime": publish,
        "startTime": start,
        "generation": generation,
    }


def test_wind_forecasts_are_fetched_in_chunks_and_deduplicated() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.url.path == "/bmrs/api/v1" + WINDFOR_PATH
        # The same run appears in both chunks (inclusive boundaries) and must be kept once.
        return httpx.Response(
            200,
            json=[
                _windfor_row("2026-01-02T00:00:00Z", "2026-01-02T12:00:00Z", 100),
                _windfor_row("2026-01-02T00:00:00Z", "2026-01-02T13:00:00Z", 110),
            ],
        )

    with _client(handler) as client:
        records = client.fetch_wind_forecasts(
            utc(2026, 1, 1), utc(2026, 1, 3), chunk=timedelta(days=1)
        )

    assert [r.url.params["publishDateTimeFrom"] for r in requests] == [
        "2026-01-01T00:00:00Z",
        "2026-01-02T00:00:00Z",
    ]
    assert [r.url.params["publishDateTimeTo"] for r in requests] == [
        "2026-01-02T00:00:00Z",
        "2026-01-03T00:00:00Z",
    ]
    assert len(records) == 2
    assert records[0].publish_time == utc(2026, 1, 2)
    assert records[0].start_time == utc(2026, 1, 2, 12)
    assert records[0].publish_time.tzinfo is not None


def test_forecast_runs_outside_the_requested_window_are_dropped() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json=[_windfor_row("2025-12-31T22:30:00Z", "2026-01-01T12:00:00Z", 1)]
        )

    with _client(handler) as client:
        assert client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2)) == []


def test_wind_outturn_keeps_only_wind_and_latest_restatement() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/bmrs/api/v1" + FUELHH_PATH
        assert request.url.params["fuelType"] == "WIND"
        base = {
            "dataset": "FUELHH",
            "startTime": "2026-01-01T00:00:00Z",
            "settlementDate": "2026-01-01",
            "settlementPeriod": 1,
        }
        return httpx.Response(
            200,
            json=[
                {
                    **base,
                    "publishTime": "2026-01-01T00:30:00Z",
                    "fuelType": "WIND",
                    "generation": 5,
                },
                {
                    **base,
                    "publishTime": "2026-01-01T01:30:00Z",
                    "fuelType": "WIND",
                    "generation": 6,
                },
                {
                    **base,
                    "publishTime": "2026-01-01T00:30:00Z",
                    "fuelType": "CCGT",
                    "generation": 9,
                },
            ],
        )

    with _client(handler) as client:
        records = client.fetch_wind_outturn(date(2026, 1, 1), date(2026, 1, 1))

    assert len(records) == 1
    assert records[0].generation_mw == 6
    assert records[0].settlement_period == 1


def test_outturn_date_chunks_cover_the_range_without_overlap() -> None:
    ranges: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        ranges.append(
            (request.url.params["settlementDateFrom"], request.url.params["settlementDateTo"])
        )
        return httpx.Response(200, json=[])

    with _client(handler) as client:
        client.fetch_wind_outturn(date(2026, 1, 1), date(2026, 1, 10), chunk_days=4)

    assert ranges == [
        ("2026-01-01", "2026-01-04"),
        ("2026-01-05", "2026-01-08"),
        ("2026-01-09", "2026-01-10"),
    ]


def test_throttling_and_server_errors_are_retried_with_backoff() -> None:
    responses = iter([httpx.Response(429), httpx.Response(503), httpx.Response(200, json=[])])
    sleeps: list[float] = []

    with _client(lambda _: next(responses), sleeps) as client:
        assert client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2)) == []

    assert sleeps == [0.5, 1.0]


def test_network_errors_are_retried_then_reported() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    sleeps: list[float] = []
    with _client(handler, sleeps) as client, pytest.raises(ElexonError, match="after 3 attempts"):
        client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2))
    assert sleeps == [0.5, 1.0]


def test_client_errors_are_not_retried() -> None:
    calls: list[int] = []

    def handler(_: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(400, text="bad request")

    with _client(handler) as client, pytest.raises(ElexonError, match="HTTP 400"):
        client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2))
    assert len(calls) == 1


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json=[{"publishTime": "not-a-date"}]),
        httpx.Response(200, content=b"<html>"),
    ],
    ids=["schema", "json"],
)
def test_malformed_payloads_raise(response: httpx.Response) -> None:
    with _client(lambda _: response) as client, pytest.raises(ElexonError):
        client.fetch_wind_forecasts(utc(2026, 1, 1), utc(2026, 1, 2))
