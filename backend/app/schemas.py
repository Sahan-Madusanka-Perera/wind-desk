"""Response models (DTOs) shared by the analytics service and the HTTP layer.

Fields are snake_case in Python and serialised as camelCase JSON. All instants are UTC
ISO-8601 strings; power is in MW and energy in MWh / GWh.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class Interval(ApiModel):
    start: datetime
    end: datetime


class ErrorMetricsOut(ApiModel):
    count: int
    mae_mw: float
    rmse_mw: float
    bias_mw: float
    median_abs_error_mw: float
    p90_abs_error_mw: float
    p99_abs_error_mw: float
    max_over_forecast_mw: float
    max_under_forecast_mw: float
    wape_pct: float | None
    correlation: float | None


class MetricsPair(ApiModel):
    raw: ErrorMetricsOut | None
    calibrated: ErrorMetricsOut | None


# --------------------------------------------------------------------------- meta


class GateClosurePresetOut(ApiModel):
    id: str
    label: str
    time: str


class DataProvenanceOut(ApiModel):
    source: Literal["snapshot", "live"]
    provider: str
    fetched_at: datetime
    forecast_publish_from: datetime
    forecast_publish_to: datetime
    actual_settlement_from: date
    actual_settlement_to: date
    forecast_records: int
    forecast_runs: int
    actual_records: int


class MetaOut(ApiModel):
    product: str
    version: str
    timezone: str
    first_decision_date: date
    last_decision_date: date
    first_delivery_date: date
    last_delivery_date: date
    evaluation_window: Interval
    default_gate_closure: str
    gate_closure_presets: list[GateClosurePresetOut]
    calibration_window_days: int
    band_coverage: float
    max_lead_hours: int
    data: DataProvenanceOut


class HealthOut(ApiModel):
    status: Literal["ok"]
    version: str
    data_source: Literal["snapshot", "live"]


# --------------------------------------------------------------------------- series


class ForecastPointOut(ApiModel):
    start_time: datetime
    forecast_mw: float
    publish_time: datetime
    lead_hours: float
    actual_mw: float | None
    calibrated_mw: float | None
    lower_mw: float | None
    upper_mw: float | None


class ActualPointOut(ApiModel):
    start_time: datetime
    generation_mw: float


class CalibrationOut(ApiModel):
    slope: float
    intercept_mw: float
    residual_lower_mw: float
    residual_upper_mw: float
    coverage: float
    training_from: date
    training_to: date
    training_days: int
    training_points: int


# --------------------------------------------------------------------------- briefing


class VintagePointOut(ApiModel):
    start_time: datetime
    forecast_mw: float


class VintageOut(ApiModel):
    publish_time: datetime
    available_at_decision: bool
    used_for_decision: bool
    points: list[VintagePointOut]


class DaySummaryOut(ApiModel):
    forecast_energy_mwh: float | None
    calibrated_energy_mwh: float | None
    dependable_energy_mwh: float | None
    actual_energy_mwh: float | None
    forecast_mean_mw: float
    forecast_peak_mw: float
    forecast_peak_time: datetime
    forecast_min_mw: float
    forecast_min_time: datetime


class BriefingOut(ApiModel):
    delivery_date: date
    decision_date: date
    gate_closure: str
    decision_cutoff: datetime
    window: Interval
    forecast_publish_time: datetime | None
    next_publish_time: datetime | None
    lead_hours_min: float | None
    lead_hours_max: float | None
    expected_points: int
    calibration: CalibrationOut | None
    summary: DaySummaryOut | None
    metrics: MetricsPair
    points: list[ForecastPointOut]
    actuals: list[ActualPointOut]
    vintages: list[VintageOut]


# --------------------------------------------------------------------------- explorer


class TimeSeriesOut(ApiModel):
    mode: Literal["decision", "lead"]
    gate_closure: str | None
    lead_hours: int | None
    from_date: date
    to_date: date
    window: Interval
    points: list[ForecastPointOut]
    actuals: list[ActualPointOut]
    metrics: MetricsPair


# --------------------------------------------------------------------------- accuracy


class BandOut(ApiModel):
    target_coverage: float
    observed_coverage: float
    mean_width_mw: float
    count: int


class EnergyOut(ApiModel):
    forecast_gwh: float
    calibrated_gwh: float | None
    actual_gwh: float


class DailyAccuracyOut(ApiModel):
    delivery_date: date
    count: int
    raw_mae_mw: float
    raw_bias_mw: float
    calibrated_mae_mw: float | None
    calibrated_bias_mw: float | None
    forecast_energy_mwh: float
    actual_energy_mwh: float


class SegmentAccuracyOut(ApiModel):
    count: int
    raw_mae_mw: float
    raw_bias_mw: float
    calibrated_mae_mw: float | None
    calibrated_bias_mw: float | None


class HourAccuracyOut(SegmentAccuracyOut):
    hour: int


class LevelAccuracyOut(SegmentAccuracyOut):
    lower_mw: float
    upper_mw: float


class HistogramBinOut(ApiModel):
    lower_mw: float
    upper_mw: float
    raw_count: int
    calibrated_count: int


class LeadAccuracyOut(ApiModel):
    lead_hours: int
    count: int
    mae_mw: float
    bias_mw: float
    p90_abs_error_mw: float


class BufferOut(ApiModel):
    confidence: float
    raw_mw: float
    calibrated_mw: float | None


class ScatterPointOut(ApiModel):
    start_time: datetime
    forecast_mw: float
    calibrated_mw: float | None
    actual_mw: float


class AccuracyOut(ApiModel):
    gate_closure: str
    window: Interval
    first_delivery_date: date
    last_delivery_date: date
    delivery_days: int
    decision_lead_hours_min: float | None
    decision_lead_hours_max: float | None
    metrics: MetricsPair
    mae_reduction_pct: float | None
    band: BandOut | None
    energy: EnergyOut | None
    daily: list[DailyAccuracyOut]
    by_hour: list[HourAccuracyOut]
    by_level: list[LevelAccuracyOut]
    histogram_bin_width_mw: float
    histogram: list[HistogramBinOut]
    by_lead: list[LeadAccuracyOut]
    buffers: list[BufferOut]
    scatter: list[ScatterPointOut]
