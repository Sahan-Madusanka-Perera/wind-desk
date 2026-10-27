"""Application settings.

Every value can be overridden with an environment variable prefixed ``WINDDESK_``
(for example ``WINDDESK_DATA_SOURCE=live``).
"""

from __future__ import annotations

from datetime import date, time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SNAPSHOT_DIR = BACKEND_ROOT / "app" / "data" / "snapshot"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WINDDESK_", frozen=True)

    # --- Scope of the pilot -------------------------------------------------------------
    # Purchase decisions are taken on day D-1 for delivery day D. The pilot covers every
    # decision taken in January 2026, i.e. delivery days 2 Jan 2026 to 1 Feb 2026.
    first_decision_date: date = date(2026, 1, 1)
    last_decision_date: date = date(2026, 1, 31)

    # --- Market conventions -------------------------------------------------------------
    default_gate_closure: time = time(9, 50)

    # --- Calibration model --------------------------------------------------------------
    calibration_window_days: int = Field(default=14, ge=3, le=60)
    calibration_min_points: int = Field(default=168, ge=10)
    band_coverage: float = Field(default=0.8, gt=0.0, lt=1.0)

    # --- Analysis -----------------------------------------------------------------------
    max_lead_hours: int = Field(default=48, ge=1, le=72)

    # --- Data access --------------------------------------------------------------------
    data_source: Literal["snapshot", "live"] = "snapshot"
    snapshot_dir: Path = DEFAULT_SNAPSHOT_DIR
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_seconds: float = Field(default=30.0, gt=0)

    # --- Web serving --------------------------------------------------------------------
    static_dir: Path | None = None
    cors_origins: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_window(self) -> Settings:
        if self.last_decision_date < self.first_decision_date:
            raise ValueError("last_decision_date must not be before first_decision_date")
        return self

    @property
    def first_delivery_date(self) -> date:
        return self.first_decision_date + timedelta(days=1)

    @property
    def last_delivery_date(self) -> date:
        return self.last_decision_date + timedelta(days=1)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
