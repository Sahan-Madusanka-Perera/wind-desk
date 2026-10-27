"""FastAPI application factory and ASGI entry point (``uvicorn app.main:app``)."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app import __version__
from app.api.dependencies import AnalyticsProvider
from app.api.routes import router
from app.config import Settings, get_settings
from app.data.elexon_client import ElexonError
from app.data.repository import Dataset, SnapshotError, load_dataset
from app.services.analytics import InvalidRequestError

logger = logging.getLogger("winddesk")

API_DESCRIPTION = """
Day-ahead wind forecast monitoring for GB power procurement.

Built on two Elexon Insights (BMRS) datasets: **WINDFOR** (wind generation forecasts)
and **FUELHH** (metered half-hourly outturn, fuel type `WIND`). All instants are UTC;
power is in MW. Forecast error is defined as `forecast - actual`.
"""

# Snapshot data never changes between deployments, so responses can be cached by browsers
# and by the CDN in front of the serverless deployment.
SNAPSHOT_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400"


def create_app(
    settings: Settings | None = None,
    *,
    dataset_loader: Callable[[Settings], Dataset] = load_dataset,
) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="WindDesk API",
        version=__version__,
        description=API_DESCRIPTION,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.analytics = AnalyticsProvider(settings, dataset_loader)

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def cache_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        if (
            settings.data_source == "snapshot"
            and request.method == "GET"
            and request.url.path.startswith("/api/")
            and request.url.path != "/api/health"
            and response.status_code == 200
        ):
            response.headers.setdefault("Cache-Control", SNAPSHOT_CACHE_CONTROL)
        return response

    @app.exception_handler(InvalidRequestError)
    async def invalid_request(_: Request, exc: InvalidRequestError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(SnapshotError)
    @app.exception_handler(ElexonError)
    async def data_unavailable(_: Request, exc: Exception) -> JSONResponse:
        logger.error("Wind data could not be loaded: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"detail": "Wind data is temporarily unavailable. Please try again shortly."},
        )

    app.include_router(router)

    if settings.static_dir is not None:
        _mount_frontend(app, settings.static_dir)

    return app


def _mount_frontend(app: FastAPI, static_dir: Path) -> None:
    """Serve the built single-page app, falling back to ``index.html`` for client routes."""
    root = static_dir.resolve()
    index = root / "index.html"
    if not index.is_file():
        logger.warning("Static directory %s has no index.html; frontend not served", root)
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (root / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(root):
            # Vite fingerprints everything under /assets, so it can be cached forever.
            immutable = candidate.is_relative_to(root / "assets")
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if immutable else {}
            return FileResponse(candidate, headers=headers)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = create_app()
