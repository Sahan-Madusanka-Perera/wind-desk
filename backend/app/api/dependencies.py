"""Dependency wiring for the HTTP layer."""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings
from app.data.repository import Dataset, load_dataset
from app.services.analytics import ForecastAnalytics


class AnalyticsProvider:
    """Builds the analytics service once, on first use, and shares it across requests.

    Loading lazily keeps start-up instant (important for serverless cold starts) and
    lets the process come up even if the data source is briefly unavailable.
    """

    def __init__(
        self, settings: Settings, loader: Callable[[Settings], Dataset] = load_dataset
    ) -> None:
        self._settings = settings
        self._loader = loader
        self._lock = threading.Lock()
        self._instance: ForecastAnalytics | None = None

    def __call__(self) -> ForecastAnalytics:
        if self._instance is None:
            with self._lock:
                if self._instance is None:
                    self._instance = ForecastAnalytics(self._loader(self._settings), self._settings)
        return self._instance


def get_analytics(request: Request) -> ForecastAnalytics:
    provider: AnalyticsProvider = request.app.state.analytics
    return provider()


def get_app_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


AnalyticsDep = Annotated[ForecastAnalytics, Depends(get_analytics)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
