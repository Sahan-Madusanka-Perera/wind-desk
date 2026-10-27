"""Walk-forward linear calibration of the raw wind forecast.

The raw forecast systematically over-forecasts metered wind outturn, and the gap widens
as the forecast level rises. A linear model ``actual ≈ intercept + slope * forecast``,
re-fitted every day on a trailing window of *already settled* delivery days, removes most
of that bias. The empirical quantiles of the training residuals give a prediction band.

The model is deliberately simple: it is transparent to traders, cheap to compute and
uses only information that existed at the moment the purchase decision was taken.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.domain.metrics import percentile


@dataclass(frozen=True, slots=True)
class LinearCalibration:
    intercept_mw: float
    slope: float
    residual_lower_mw: float
    residual_upper_mw: float
    coverage: float
    training_days: tuple[date, ...]
    training_points: int

    def fitted(self, forecast_mw: float) -> float:
        return self.intercept_mw + self.slope * forecast_mw

    def predict(self, forecast_mw: float) -> float:
        """Calibrated expectation of outturn; wind generation cannot be negative."""
        return max(0.0, self.fitted(forecast_mw))

    def band(self, forecast_mw: float) -> tuple[float, float]:
        """Central prediction interval holding ``coverage`` of training outcomes."""
        centre = self.fitted(forecast_mw)
        return (
            max(0.0, centre + self.residual_lower_mw),
            max(0.0, centre + self.residual_upper_mw),
        )


def fit_linear_calibration(
    forecasts: Sequence[float],
    actuals: Sequence[float],
    *,
    coverage: float,
    training_days: Sequence[date],
    min_points: int,
) -> LinearCalibration | None:
    """Ordinary least squares fit of ``actual`` on ``forecast``.

    Returns ``None`` when there are fewer than ``min_points`` training pairs. If the
    training forecasts have no spread the slope is fixed at 1 (a pure bias shift).
    """
    if len(forecasts) != len(actuals):
        raise ValueError("forecasts and actuals must have the same length")
    if not 0.0 < coverage < 1.0:
        raise ValueError("coverage must be within (0, 1)")
    n = len(forecasts)
    if n < max(min_points, 2):
        return None

    mean_f = math.fsum(forecasts) / n
    mean_a = math.fsum(actuals) / n
    sxx = math.fsum((f - mean_f) ** 2 for f in forecasts)
    if sxx == 0.0:
        slope = 1.0
    else:
        sxy = math.fsum(
            (f - mean_f) * (a - mean_a) for f, a in zip(forecasts, actuals, strict=True)
        )
        slope = sxy / sxx
    intercept = mean_a - slope * mean_f

    residuals = sorted(a - (intercept + slope * f) for f, a in zip(forecasts, actuals, strict=True))
    tail = (1.0 - coverage) / 2.0
    return LinearCalibration(
        intercept_mw=intercept,
        slope=slope,
        residual_lower_mw=percentile(residuals, tail),
        residual_upper_mw=percentile(residuals, 1.0 - tail),
        coverage=coverage,
        training_days=tuple(training_days),
        training_points=n,
    )
