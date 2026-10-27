"""Forecast error metrics.

Sign convention used throughout the product::

    error = forecast - actual

A positive error is an **over-forecast**: less wind turned up than was forecast, so the
buyer is short and has to procure the shortfall elsewhere.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ErrorMetrics:
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


def percentile(sorted_values: Sequence[float], fraction: float) -> float:
    """Percentile of already-sorted data using linear interpolation between closest ranks.

    Matches NumPy's default (``method="linear"``), so results can be reproduced in a notebook.
    """
    if not sorted_values:
        raise ValueError("percentile of empty data")
    if not 0.0 <= fraction <= 1.0:
        raise ValueError("fraction must be within [0, 1]")
    position = (len(sorted_values) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(sorted_values[lower])
    weight = position - lower
    return float(sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight)


def pearson_correlation(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    if len(xs) != len(ys):
        raise ValueError("xs and ys must have the same length")
    n = len(xs)
    if n < 2:
        return None
    mean_x = math.fsum(xs) / n
    mean_y = math.fsum(ys) / n
    sxx = math.fsum((x - mean_x) ** 2 for x in xs)
    syy = math.fsum((y - mean_y) ** 2 for y in ys)
    if sxx == 0.0 or syy == 0.0:
        return None
    sxy = math.fsum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    return sxy / math.sqrt(sxx * syy)


def compute_error_metrics(
    forecasts: Sequence[float], actuals: Sequence[float]
) -> ErrorMetrics | None:
    """Summary statistics of ``forecast - actual``; ``None`` when there is nothing to score."""
    if len(forecasts) != len(actuals):
        raise ValueError("forecasts and actuals must have the same length")
    count = len(forecasts)
    if count == 0:
        return None

    errors = [f - a for f, a in zip(forecasts, actuals, strict=True)]
    abs_errors = sorted(abs(e) for e in errors)
    total_actual = math.fsum(actuals)

    return ErrorMetrics(
        count=count,
        mae_mw=math.fsum(abs_errors) / count,
        rmse_mw=math.sqrt(math.fsum(e * e for e in errors) / count),
        bias_mw=math.fsum(errors) / count,
        median_abs_error_mw=percentile(abs_errors, 0.5),
        p90_abs_error_mw=percentile(abs_errors, 0.9),
        p99_abs_error_mw=percentile(abs_errors, 0.99),
        max_over_forecast_mw=max(0.0, max(errors)),
        max_under_forecast_mw=max(0.0, -min(errors)),
        wape_pct=100.0 * math.fsum(abs_errors) / total_actual if total_actual > 0 else None,
        correlation=pearson_correlation(forecasts, actuals),
    )
