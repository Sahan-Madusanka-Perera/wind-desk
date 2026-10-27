"""REST endpoints. Every endpoint is a read-only ``GET`` returning camelCase JSON."""

from __future__ import annotations

from datetime import date, time
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app import schemas as s
from app.api.dependencies import AnalyticsDep, SettingsDep
from app.config import Settings
from app.domain.market import parse_gate_closure
from app.services.analytics import InvalidRequestError

router = APIRouter(prefix="/api")

GateClosureQuery = Annotated[
    str | None,
    Query(
        alias="gateClosure",
        description="Auction gate closure on D-1 as a UK clock time (HH:MM, before 23:00). "
        "Defaults to the Nord Pool N2EX gate closure, 09:50.",
        examples=["09:50"],
    ),
]


def _resolve_gate_closure(value: str | None, settings: Settings) -> time:
    if value is None:
        return settings.default_gate_closure
    try:
        return parse_gate_closure(value)
    except ValueError as exc:
        raise InvalidRequestError(str(exc)) from exc


@router.get("/health", response_model=s.HealthOut, summary="Liveness and data readiness")
def health(analytics: AnalyticsDep) -> s.HealthOut:
    return analytics.health()


@router.get("/meta", response_model=s.MetaOut, summary="Scope, market conventions and data lineage")
def meta(analytics: AnalyticsDep) -> s.MetaOut:
    return analytics.meta()


@router.get(
    "/briefing",
    response_model=s.BriefingOut,
    summary="Day-ahead briefing for one delivery day",
    description="The forecast a trader had at gate closure on D-1, the calibrated view with "
    "its uncertainty band, how the forecast evolved, and the metered outturn.",
)
def briefing(
    analytics: AnalyticsDep,
    settings: SettingsDep,
    delivery_date: Annotated[date, Query(alias="deliveryDate", examples=["2026-01-15"])],
    gate_closure: GateClosureQuery = None,
) -> s.BriefingOut:
    return analytics.briefing(delivery_date, _resolve_gate_closure(gate_closure, settings))


@router.get(
    "/timeseries",
    response_model=s.TimeSeriesOut,
    summary="Forecast versus outturn over a range of delivery days",
    description="`mode=decision` uses the forecast available at gate closure on D-1 for each "
    "delivery day. `mode=lead` uses, for every target hour, the latest forecast published at "
    "least `leadHours` hours earlier.",
)
def timeseries(
    analytics: AnalyticsDep,
    settings: SettingsDep,
    from_date: Annotated[date, Query(alias="from", examples=["2026-01-10"])],
    to_date: Annotated[date, Query(alias="to", examples=["2026-01-16"])],
    mode: Annotated[Literal["decision", "lead"], Query()] = "decision",
    gate_closure: GateClosureQuery = None,
    lead_hours: Annotated[int, Query(alias="leadHours", ge=0, le=72)] = 4,
) -> s.TimeSeriesOut:
    return analytics.timeseries(
        from_date,
        to_date,
        mode=mode,
        gate_closure=_resolve_gate_closure(gate_closure, settings),
        lead_hours=lead_hours,
    )


@router.get(
    "/accuracy",
    response_model=s.AccuracyOut,
    summary="Accuracy report across every decision in the pilot window",
)
def accuracy(
    analytics: AnalyticsDep, settings: SettingsDep, gate_closure: GateClosureQuery = None
) -> s.AccuracyOut:
    return analytics.accuracy(_resolve_gate_closure(gate_closure, settings))
