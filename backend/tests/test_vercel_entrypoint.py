"""The Vercel adapter must route identically whichever path the platform passes."""

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest
from fastapi.testclient import TestClient

ENTRYPOINT = Path(__file__).resolve().parents[2] / "api" / "index.py"


@pytest.fixture(scope="module")
def entrypoint() -> ModuleType:
    spec = importlib.util.spec_from_file_location("vercel_entrypoint", ENTRYPOINT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def client(entrypoint: ModuleType) -> TestClient:
    return TestClient(entrypoint.app)


def test_original_path_is_served_and_rewrite_param_ignored(client: TestClient) -> None:
    response = client.get("/api/health", params={"wdroute": "health"})
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_rewrite_destination_is_mapped_back_to_the_route(client: TestClient) -> None:
    response = client.get(
        "/api/index", params={"wdroute": "briefing", "deliveryDate": "2026-01-15"}
    )
    assert response.status_code == 200
    assert response.json()["deliveryDate"] == "2026-01-15"


def test_nested_routes_and_unknown_paths(client: TestClient) -> None:
    assert client.get("/api/index", params={"wdroute": "openapi.json"}).status_code == 200
    assert client.get("/api/index", params={"wdroute": "nope"}).status_code == 404
