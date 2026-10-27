from datetime import date

import pytest

from app.domain.calibration import fit_linear_calibration

DAYS = [date(2026, 1, 1), date(2026, 1, 2)]


def test_recovers_an_exact_linear_relationship() -> None:
    forecasts = [float(f) for f in range(1000, 20000, 500)]
    actuals = [0.8 * f - 100 for f in forecasts]
    calibration = fit_linear_calibration(
        forecasts, actuals, coverage=0.8, training_days=DAYS, min_points=10
    )
    assert calibration is not None
    assert calibration.slope == pytest.approx(0.8)
    assert calibration.intercept_mw == pytest.approx(-100.0)
    assert calibration.residual_lower_mw == pytest.approx(0.0, abs=1e-6)
    assert calibration.residual_upper_mw == pytest.approx(0.0, abs=1e-6)
    assert calibration.predict(10_000) == pytest.approx(7900.0)
    assert calibration.training_points == len(forecasts)
    assert calibration.training_days == tuple(DAYS)


def test_band_holds_the_requested_share_of_training_residuals() -> None:
    forecasts = [float(f) for f in range(100)]
    noise = [(-1) ** i * (i % 10) for i in range(100)]
    actuals = [f + n for f, n in zip(forecasts, noise, strict=True)]
    calibration = fit_linear_calibration(
        forecasts, actuals, coverage=0.8, training_days=DAYS, min_points=10
    )
    assert calibration is not None
    inside = 0
    for f, a in zip(forecasts, actuals, strict=True):
        lower, upper = calibration.band(f)
        inside += lower <= a <= upper
    assert 0.78 <= inside / len(forecasts) <= 0.84


def test_predictions_and_band_never_go_negative() -> None:
    calibration = fit_linear_calibration(
        [100.0, 200.0, 300.0], [0.0, 50.0, 100.0], coverage=0.8, training_days=DAYS, min_points=3
    )
    assert calibration is not None
    assert calibration.predict(0.0) == 0.0
    lower, upper = calibration.band(0.0)
    assert lower == 0.0
    assert upper >= lower


def test_constant_forecasts_fall_back_to_a_bias_shift() -> None:
    calibration = fit_linear_calibration(
        [500.0] * 5,
        [400.0, 420.0, 380.0, 400.0, 400.0],
        coverage=0.8,
        training_days=DAYS,
        min_points=5,
    )
    assert calibration is not None
    assert calibration.slope == 1.0
    assert calibration.predict(500.0) == pytest.approx(400.0)


def test_returns_none_without_enough_history() -> None:
    assert (
        fit_linear_calibration(
            [1.0, 2.0], [1.0, 2.0], coverage=0.8, training_days=DAYS, min_points=3
        )
        is None
    )


def test_validates_arguments() -> None:
    with pytest.raises(ValueError, match="same length"):
        fit_linear_calibration([1.0], [], coverage=0.8, training_days=DAYS, min_points=1)
    with pytest.raises(ValueError, match="coverage"):
        fit_linear_calibration(
            [1.0, 2.0], [1.0, 2.0], coverage=1.0, training_days=DAYS, min_points=1
        )
