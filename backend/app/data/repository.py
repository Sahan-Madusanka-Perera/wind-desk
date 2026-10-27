"""Dataset loading and snapshot persistence.

The pilot analyses a fixed historical window, so the API serves a versioned snapshot
produced by ``python -m app.ingest``. That keeps responses fast and reproducible, and the
app keeps working if the Elexon API is slow or unavailable. ``WINDDESK_DATA_SOURCE=live``
switches to fetching the same window directly from Elexon at start-up.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import zlib
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from app.config import Settings
from app.data.elexon_client import FUELHH_PATH, WINDFOR_PATH, ElexonClient
from app.domain.market import delivery_window
from app.domain.models import ActualRecord, ForecastRecord

SNAPSHOT_SCHEMA_VERSION = 1
FORECASTS_FILE = "windfor.json.gz"
ACTUALS_FILE = "fuelhh_wind.json.gz"
MANIFEST_FILE = "manifest.json"

DataSource = Literal["snapshot", "live"]


class SnapshotError(RuntimeError):
    """Raised when a snapshot is missing, corrupt or incompatible."""


@dataclass(frozen=True, slots=True)
class IngestionWindows:
    """Raw-data extent needed to analyse every decision in the configured scope."""

    forecast_publish_from: datetime
    forecast_publish_to: datetime
    actual_settlement_from: date
    actual_settlement_to: date


@dataclass(frozen=True, slots=True)
class Provenance:
    source: DataSource
    fetched_at: datetime
    windows: IngestionWindows


@dataclass(frozen=True, slots=True)
class Dataset:
    forecasts: tuple[ForecastRecord, ...]
    actuals: tuple[ActualRecord, ...]
    provenance: Provenance


def ingestion_windows(settings: Settings) -> IngestionWindows:
    """Data needed for the evaluation window plus the calibration look-back.

    The calibration for the first delivery day trains on the ``calibration_window_days``
    settled delivery days before it, so data from mid-December 2025 is required to
    support decisions taken from 1 January 2026. Only information that was already
    public at each January decision time is used for that decision.
    """
    earliest_training_day = settings.first_delivery_date - timedelta(
        days=settings.calibration_window_days + 1
    )
    return IngestionWindows(
        # Two days of margin so that a forecast exists before even a 00:00 gate closure.
        forecast_publish_from=delivery_window(earliest_training_day).start - timedelta(days=2),
        forecast_publish_to=delivery_window(settings.last_delivery_date).end,
        actual_settlement_from=earliest_training_day - timedelta(days=1),
        actual_settlement_to=settings.last_delivery_date,
    )


# ----------------------------------------------------------------------------- loading


def load_dataset(settings: Settings) -> Dataset:
    if settings.data_source == "live":
        return fetch_live_dataset(settings)
    return load_snapshot(settings.snapshot_dir)


def fetch_live_dataset(settings: Settings, client: ElexonClient | None = None) -> Dataset:
    windows = ingestion_windows(settings)
    owned = client is None
    elexon = client or ElexonClient(
        settings.elexon_base_url, timeout_seconds=settings.elexon_timeout_seconds
    )
    try:
        forecasts = elexon.fetch_wind_forecasts(
            windows.forecast_publish_from, windows.forecast_publish_to
        )
        actuals = elexon.fetch_wind_outturn(
            windows.actual_settlement_from, windows.actual_settlement_to
        )
    finally:
        if owned:
            elexon.close()
    return Dataset(
        forecasts=tuple(forecasts),
        actuals=tuple(actuals),
        provenance=Provenance(source="live", fetched_at=datetime.now(UTC), windows=windows),
    )


# ----------------------------------------------------------------------------- snapshot


def _iso(instant: datetime) -> str:
    return instant.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def _encode(document: dict[str, Any]) -> bytes:
    raw = json.dumps(document, separators=(",", ":"), sort_keys=True).encode("utf-8")
    # mtime=0 keeps the archive byte-for-byte reproducible for identical data.
    return gzip.compress(raw, compresslevel=9, mtime=0)


def write_snapshot(dataset: Dataset, directory: Path) -> dict[str, Any]:
    """Persist ``dataset`` and return the manifest that was written alongside it."""
    directory.mkdir(parents=True, exist_ok=True)
    windows = dataset.provenance.windows

    forecasts_blob = _encode(
        {
            "columns": ["publishTime", "startTime", "generation"],
            "rows": [
                [_iso(r.publish_time), _iso(r.start_time), r.generation_mw]
                for r in sorted(dataset.forecasts, key=lambda r: (r.publish_time, r.start_time))
            ],
        }
    )
    actuals_blob = _encode(
        {
            "columns": [
                "startTime",
                "settlementDate",
                "settlementPeriod",
                "publishTime",
                "generation",
            ],
            "rows": [
                [
                    _iso(r.start_time),
                    r.settlement_date.isoformat(),
                    r.settlement_period,
                    _iso(r.publish_time),
                    r.generation_mw,
                ]
                for r in sorted(dataset.actuals, key=lambda r: r.start_time)
            ],
        }
    )

    manifest: dict[str, Any] = {
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "source": "Elexon Insights Solution (BMRS) API",
        "fetchedAt": _iso(dataset.provenance.fetched_at),
        "datasets": {
            "WINDFOR": {
                "endpoint": WINDFOR_PATH,
                "file": FORECASTS_FILE,
                "publishDateTimeFrom": _iso(windows.forecast_publish_from),
                "publishDateTimeTo": _iso(windows.forecast_publish_to),
                "records": len(dataset.forecasts),
                "sha256": hashlib.sha256(forecasts_blob).hexdigest(),
            },
            "FUELHH": {
                "endpoint": FUELHH_PATH,
                "file": ACTUALS_FILE,
                "fuelType": "WIND",
                "settlementDateFrom": windows.actual_settlement_from.isoformat(),
                "settlementDateTo": windows.actual_settlement_to.isoformat(),
                "records": len(dataset.actuals),
                "sha256": hashlib.sha256(actuals_blob).hexdigest(),
            },
        },
    }

    (directory / FORECASTS_FILE).write_bytes(forecasts_blob)
    (directory / ACTUALS_FILE).write_bytes(actuals_blob)
    (directory / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def _read_verified(directory: Path, entry: dict[str, Any]) -> list[list[Any]]:
    blob = (directory / entry["file"]).read_bytes()
    if hashlib.sha256(blob).hexdigest() != entry["sha256"]:
        raise SnapshotError(f"Checksum mismatch for {entry['file']}; re-run the ingestion")
    rows: list[list[Any]] = json.loads(gzip.decompress(blob))["rows"]
    if len(rows) != entry["records"]:
        raise SnapshotError(
            f"{entry['file']} holds {len(rows)} rows, manifest says {entry['records']}"
        )
    return rows


def load_snapshot(directory: Path) -> Dataset:
    manifest_path = directory / MANIFEST_FILE
    if not manifest_path.is_file():
        raise SnapshotError(
            f"No data snapshot found in {directory}. Run `python -m app.ingest` to create one."
        )
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("schemaVersion") != SNAPSHOT_SCHEMA_VERSION:
            raise SnapshotError(f"Unsupported snapshot schema {manifest.get('schemaVersion')!r}")
        windfor = manifest["datasets"]["WINDFOR"]
        fuelhh = manifest["datasets"]["FUELHH"]

        forecasts = tuple(
            ForecastRecord(
                publish_time=_parse_instant(publish),
                start_time=_parse_instant(start),
                generation_mw=float(generation),
            )
            for publish, start, generation in _read_verified(directory, windfor)
        )
        actuals = tuple(
            ActualRecord(
                start_time=_parse_instant(start),
                settlement_date=date.fromisoformat(settlement_date),
                settlement_period=int(settlement_period),
                publish_time=_parse_instant(publish),
                generation_mw=float(generation),
            )
            for start, settlement_date, settlement_period, publish, generation in _read_verified(
                directory, fuelhh
            )
        )
        windows = IngestionWindows(
            forecast_publish_from=_parse_instant(windfor["publishDateTimeFrom"]),
            forecast_publish_to=_parse_instant(windfor["publishDateTimeTo"]),
            actual_settlement_from=date.fromisoformat(fuelhh["settlementDateFrom"]),
            actual_settlement_to=date.fromisoformat(fuelhh["settlementDateTo"]),
        )
        fetched_at = _parse_instant(manifest["fetchedAt"])
    except SnapshotError:
        raise
    except (KeyError, ValueError, TypeError, OSError, EOFError, zlib.error) as exc:
        raise SnapshotError(f"Snapshot in {directory} is invalid: {exc}") from exc

    return Dataset(
        forecasts=forecasts,
        actuals=actuals,
        provenance=Provenance(source="snapshot", fetched_at=fetched_at, windows=windows),
    )
