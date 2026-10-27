"""Refresh the bundled data snapshot from the Elexon Insights (BMRS) API.

Usage::

    python -m app.ingest                 # writes to the default snapshot directory
    python -m app.ingest --output /tmp/x # writes elsewhere

The command fetches exactly the window the pilot needs (see
:func:`app.data.repository.ingestion_windows`), validates it and writes gzip-compressed
JSON plus a manifest with record counts and SHA-256 checksums.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from app.config import get_settings
from app.data.quality import check_quality
from app.data.repository import fetch_live_dataset, write_snapshot
from app.domain.forecast_book import ActualSeries, ForecastBook
from app.domain.market import delivery_window

logger = logging.getLogger("winddesk.ingest")


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else None)
    parser.add_argument(
        "--output",
        type=Path,
        default=settings.snapshot_dir,
        help=f"snapshot directory (default: {settings.snapshot_dir})",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    logger.info("Fetching WINDFOR and FUELHH (WIND) from %s", settings.elexon_base_url)
    dataset = fetch_live_dataset(settings)
    windows = dataset.provenance.windows
    logger.info(
        "Fetched %d forecast values (published %s to %s) and %d outturn periods (%s to %s)",
        len(dataset.forecasts),
        windows.forecast_publish_from.isoformat(),
        windows.forecast_publish_to.isoformat(),
        len(dataset.actuals),
        windows.actual_settlement_from.isoformat(),
        windows.actual_settlement_to.isoformat(),
    )

    report = check_quality(
        ForecastBook(dataset.forecasts),
        ActualSeries(dataset.actuals),
        start=delivery_window(settings.first_delivery_date).start,
        end=delivery_window(settings.last_delivery_date).end,
        negative_values=sum(1 for r in dataset.forecasts if r.generation_mw < 0)
        + sum(1 for r in dataset.actuals if r.generation_mw < 0),
    )
    logger.info(
        "Quality: %d forecast runs, %d/%d settlement periods present, %d hours without forecast, "
        "%d negative values",
        report.forecast_runs,
        report.expected_settlement_periods - len(report.missing_settlement_periods),
        report.expected_settlement_periods,
        len(report.targets_without_forecast),
        report.negative_values,
    )
    if report.forecast_records == 0 or report.actual_records == 0:
        logger.error("Elexon returned no data; snapshot not written")
        return 1
    if not report.ok:
        logger.warning("Data has gaps; the app reports affected hours as missing")

    manifest = write_snapshot(dataset, args.output)
    for entry in manifest["datasets"].values():
        logger.info(
            "Wrote %s: %d records, sha256 %s", entry["file"], entry["records"], entry["sha256"][:12]
        )
    logger.info("Snapshot written to %s", args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
