import json
from datetime import date
from pathlib import Path

import pytest

from app.config import Settings
from app.data.repository import (
    MANIFEST_FILE,
    Dataset,
    SnapshotError,
    fetch_live_dataset,
    ingestion_windows,
    load_dataset,
    load_snapshot,
    write_snapshot,
)
from tests.conftest import utc


def test_ingestion_windows_cover_the_pilot_and_calibration_lookback() -> None:
    windows = ingestion_windows(Settings())
    # First training day for delivery on 2 Jan is 18 Dec (14 settled days, ending 31 Dec).
    assert windows.forecast_publish_from == utc(2025, 12, 15, 23)
    assert windows.forecast_publish_to == utc(2026, 2, 1, 23)
    assert windows.actual_settlement_from == date(2025, 12, 17)
    assert windows.actual_settlement_to == date(2026, 2, 1)


def test_snapshot_round_trip_is_lossless_and_reproducible(dataset: Dataset, tmp_path: Path) -> None:
    manifest = write_snapshot(dataset, tmp_path)
    first_bytes = (tmp_path / manifest["datasets"]["WINDFOR"]["file"]).read_bytes()

    loaded = load_snapshot(tmp_path)
    assert sorted(loaded.forecasts, key=lambda r: (r.publish_time, r.start_time)) == sorted(
        dataset.forecasts, key=lambda r: (r.publish_time, r.start_time)
    )
    assert list(loaded.actuals) == sorted(dataset.actuals, key=lambda r: r.start_time)
    assert loaded.provenance.windows == dataset.provenance.windows
    assert loaded.provenance.source == "snapshot"

    write_snapshot(loaded, tmp_path)
    assert (tmp_path / manifest["datasets"]["WINDFOR"]["file"]).read_bytes() == first_bytes


def test_missing_snapshot_is_reported(tmp_path: Path) -> None:
    with pytest.raises(SnapshotError, match=r"app\.ingest"):
        load_snapshot(tmp_path)


def test_tampered_snapshot_fails_checksum(dataset: Dataset, tmp_path: Path) -> None:
    manifest = write_snapshot(dataset, tmp_path)
    data_file = tmp_path / manifest["datasets"]["FUELHH"]["file"]
    data_file.write_bytes(data_file.read_bytes() + b"x")
    with pytest.raises(SnapshotError, match="Checksum"):
        load_snapshot(tmp_path)


def test_incompatible_or_corrupt_manifest_is_reported(dataset: Dataset, tmp_path: Path) -> None:
    write_snapshot(dataset, tmp_path)
    manifest_path = tmp_path / MANIFEST_FILE
    manifest = json.loads(manifest_path.read_text())

    manifest_path.write_text(json.dumps({**manifest, "schemaVersion": 99}))
    with pytest.raises(SnapshotError, match="schema"):
        load_snapshot(tmp_path)

    manifest_path.write_text("{not json")
    with pytest.raises(SnapshotError, match="invalid"):
        load_snapshot(tmp_path)


def test_load_dataset_dispatches_on_data_source(dataset: Dataset, tmp_path: Path) -> None:
    write_snapshot(dataset, tmp_path)
    loaded = load_dataset(Settings(snapshot_dir=tmp_path))
    assert loaded.provenance.source == "snapshot"
    assert len(loaded.actuals) == len(dataset.actuals)


def test_live_dataset_uses_ingestion_windows(dataset: Dataset) -> None:
    calls: list[tuple[object, object]] = []

    class FakeClient:
        def fetch_wind_forecasts(self, start: object, end: object) -> list[object]:
            calls.append((start, end))
            return list(dataset.forecasts)

        def fetch_wind_outturn(self, start: object, end: object) -> list[object]:
            calls.append((start, end))
            return list(dataset.actuals)

    settings = Settings(data_source="live")
    live = fetch_live_dataset(settings, client=FakeClient())  # type: ignore[arg-type]
    windows = ingestion_windows(settings)
    assert calls == [
        (windows.forecast_publish_from, windows.forecast_publish_to),
        (windows.actual_settlement_from, windows.actual_settlement_to),
    ]
    assert live.provenance.source == "live"
    assert len(live.forecasts) == len(dataset.forecasts)
