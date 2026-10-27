import math

import pytest

from app.domain.metrics import compute_error_metrics, pearson_correlation, percentile


def test_metrics_on_known_values() -> None:
    metrics = compute_error_metrics([10.0, 20.0, 30.0], [12.0, 18.0, 33.0])
    assert metrics is not None
    # errors (forecast - actual) = [-2, 2, -3]
    assert metrics.count == 3
    assert metrics.mae_mw == pytest.approx(7 / 3)
    assert metrics.rmse_mw == pytest.approx(math.sqrt(17 / 3))
    assert metrics.bias_mw == pytest.approx(-1.0)
    assert metrics.median_abs_error_mw == pytest.approx(2.0)
    assert metrics.p90_abs_error_mw == pytest.approx(2.8)
    assert metrics.max_over_forecast_mw == pytest.approx(2.0)
    assert metrics.max_under_forecast_mw == pytest.approx(3.0)
    assert metrics.wape_pct == pytest.approx(100 * 7 / 63)
    assert metrics.correlation is not None
    assert metrics.correlation > 0.95


def test_metrics_are_none_without_data() -> None:
    assert compute_error_metrics([], []) is None


def test_metrics_reject_mismatched_lengths() -> None:
    with pytest.raises(ValueError, match="same length"):
        compute_error_metrics([1.0], [1.0, 2.0])


def test_one_sided_errors_report_zero_for_the_other_side() -> None:
    metrics = compute_error_metrics([5.0, 6.0], [1.0, 1.0])
    assert metrics is not None
    assert metrics.max_under_forecast_mw == 0.0
    assert metrics.max_over_forecast_mw == 5.0


def test_wape_is_undefined_when_there_is_no_actual_generation() -> None:
    metrics = compute_error_metrics([1.0], [0.0])
    assert metrics is not None
    assert metrics.wape_pct is None


@pytest.mark.parametrize(
    ("fraction", "expected"),
    [(0.0, 1.0), (0.5, 2.5), (0.9, 3.7), (1.0, 4.0)],
)
def test_percentile_matches_numpy_linear_method(fraction: float, expected: float) -> None:
    assert percentile([1.0, 2.0, 3.0, 4.0], fraction) == pytest.approx(expected)


def test_percentile_validates_input() -> None:
    with pytest.raises(ValueError, match="empty"):
        percentile([], 0.5)
    with pytest.raises(ValueError, match="fraction"):
        percentile([1.0], 1.5)
    assert percentile([7.0], 0.3) == 7.0


def test_correlation_edge_cases() -> None:
    assert pearson_correlation([1.0], [2.0]) is None
    assert pearson_correlation([1.0, 1.0], [2.0, 3.0]) is None
    assert pearson_correlation([1.0, 2.0, 3.0], [3.0, 2.0, 1.0]) == pytest.approx(-1.0)
    with pytest.raises(ValueError, match="same length"):
        pearson_correlation([1.0], [])
