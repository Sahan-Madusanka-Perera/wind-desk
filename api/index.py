"""Vercel serverless entry point.

Vercel serves the built React app from its CDN and rewrites ``/api/*`` to this function
(see ``vercel.json``). The module exposes the same FastAPI application that Docker and
local development run, wrapped in a tiny adapter that restores the original request path
in case the platform invokes the function with the rewrite destination instead.
"""

from __future__ import annotations

import sys
from collections.abc import Awaitable, Callable, MutableMapping
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app as fastapi_app  # noqa: E402

REWRITE_DESTINATION = "/api/index"
ROUTE_PARAM = "wdroute"  # named segment of the `/api/:wdroute*` rewrite in vercel.json

Scope = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[MutableMapping[str, Any]]]
Send = Callable[[MutableMapping[str, Any]], Awaitable[None]]


class RestoreRewrittenPath:
    """ASGI adapter: ``/api/index?wdroute=meta&x=1`` becomes ``/api/meta?x=1``.

    The rewrite parameter is always removed from the query string; the path is only
    rebuilt when the function was invoked with the rewrite destination itself.
    """

    def __init__(self, app: Callable[[Scope, Receive, Send], Awaitable[None]]) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") == "http":
            query = parse_qsl(
                scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True
            )
            route = next((value for key, value in query if key == ROUTE_PARAM), None)
            if route is not None:
                scope = dict(scope)
                scope["query_string"] = urlencode(
                    [(key, value) for key, value in query if key != ROUTE_PARAM]
                ).encode("latin-1")
                if scope.get("path") == REWRITE_DESTINATION:
                    path = "/api/" + route.lstrip("/")
                    scope["path"] = path
                    scope["raw_path"] = path.encode("utf-8")
        await self.app(scope, receive, send)


app = RestoreRewrittenPath(fastapi_app)

__all__ = ["app"]
