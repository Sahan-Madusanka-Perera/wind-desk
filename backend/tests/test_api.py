from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.data.repository import Dataset, SnapshotError
from app.main import SNAPSHOT_CACHE_CONTROL, create_app


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "1.0.0", "dataSource": "snapshot"}
    assert "cache-control" not in response.headers


def test_meta_is_camel_case_and_cacheable(client: TestClient) -> None:
    response = client.get("/api/meta")
    assert response.status_code == 200
    body = response.json()
    assert body["firstDeliveryDate"] == "2026-01-11"
    assert body["defaultGateClosure"] == "09:50"
    assert body["evaluationWindow"] == {
        "start": "2026-01-10T23:00:00Z",
        "end": "2026-01-12T23:00:00Z",
    }
    assert response.headers["cache-control"] == SNAPSHOT_CACHE_CONTROL


def test_briefing(client: TestClient) -> None:
    response = client.get("/api/briefing", params={"deliveryDate": "2026-01-11"})
    assert response.status_code == 200
    body = response.json()
    assert body["gateClosure"] == "09:50"
    assert body["decisionCutoff"] == "2026-01-10T09:50:00Z"
    assert len(body["points"]) == 24
    assert set(body["points"][0]) == {
        "startTime",
        "forecastMw",
        "publishTime",
        "leadHours",
        "actualMw",
        "calibratedMw",
        "lowerMw",
        "upperMw",
    }


def test_briefing_honours_custom_gate_closure(client: TestClient) -> None:
    body = client.get(
        "/api/briefing", params={"deliveryDate": "2026-01-11", "gateClosure": "09:20"}
    ).json()
    assert body["gateClosure"] == "09:20"
    assert body["forecastPublishTime"] == "2026-01-10T03:30:00Z"


def test_timeseries_and_accuracy(client: TestClient) -> None:
    series = client.get(
        "/api/timeseries",
        params={"from": "2026-01-11", "to": "2026-01-12", "mode": "lead", "leadHours": 6},
    )
    assert series.status_code == 200
    assert series.json()["mode"] == "lead"
    assert len(series.json()["points"]) == 48

    accuracy = client.get("/api/accuracy", params={"gateClosure": "09:50"})
    assert accuracy.status_code == 200
    assert accuracy.json()["deliveryDays"] == 2
    assert accuracy.headers.get("content-encoding") == "gzip"


def test_invalid_requests_return_422_with_a_readable_message(client: TestClient) -> None:
    cases = [
        ("/api/briefing", {"deliveryDate": "2026-02-20"}, "Delivery date"),
        ("/api/briefing", {"deliveryDate": "2026-01-11", "gateClosure": "23:30"}, "before 23:00"),
        ("/api/briefing", {"deliveryDate": "2026-01-11", "gateClosure": "noon"}, "HH:MM"),
        ("/api/timeseries", {"from": "2026-01-12", "to": "2026-01-11"}, "must not be before"),
    ]
    for path, params, message in cases:
        response = client.get(path, params=params)
        assert response.status_code == 422, (path, params)
        assert message in response.json()["detail"]
        assert "cache-control" not in response.headers


def test_schema_validation_errors_use_fastapi_format(client: TestClient) -> None:
    assert client.get("/api/briefing").status_code == 422
    assert client.get("/api/briefing", params={"deliveryDate": "nope"}).status_code == 422
    response = client.get(
        "/api/timeseries", params={"from": "2026-01-11", "to": "2026-01-11", "mode": "x"}
    )
    assert response.status_code == 422


def test_data_outage_returns_503(settings: Settings) -> None:
    def failing_loader(_: Settings) -> Dataset:
        raise SnapshotError("disk on fire")

    with TestClient(create_app(settings, dataset_loader=failing_loader)) as client:
        response = client.get("/api/meta")
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"]
    assert "disk on fire" not in response.text


def test_openapi_document_is_served(client: TestClient) -> None:
    spec = client.get("/api/openapi.json").json()
    assert set(spec["paths"]) == {
        "/api/health",
        "/api/meta",
        "/api/briefing",
        "/api/timeseries",
        "/api/accuracy",
    }


def test_frontend_is_served_with_spa_fallback(
    settings: Settings, dataset: Dataset, tmp_path: Path
) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    secret = tmp_path.parent / "secret.txt"
    secret.write_text("secret")

    app = create_app(
        settings.model_copy(update={"static_dir": tmp_path}), dataset_loader=lambda _: dataset
    )
    with TestClient(app) as client:
        assert client.get("/").text == "<html>app</html>"
        assert client.get("/accuracy").text == "<html>app</html>"
        assert client.get("/favicon.svg").text == "<svg/>"

        asset = client.get("/assets/app.js")
        assert asset.text == "console.log(1)"
        assert "immutable" in asset.headers["cache-control"]

        assert client.get("/%2E%2E/secret.txt").text == "<html>app</html>"
        unknown_api = client.get("/api/unknown")
        assert unknown_api.status_code == 404
        assert unknown_api.json() == {"detail": "Not Found"}
        assert client.get("/api/health").json()["status"] == "ok"


def test_missing_frontend_build_is_ignored(
    settings: Settings, dataset: Dataset, tmp_path: Path
) -> None:
    app = create_app(
        settings.model_copy(update={"static_dir": tmp_path}), dataset_loader=lambda _: dataset
    )
    with TestClient(app) as client:
        assert client.get("/").status_code == 404
