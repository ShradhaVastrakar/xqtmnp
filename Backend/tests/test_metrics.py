import math
from datetime import date

import pandas as pd
import pytest

from app.analytics.metrics import compute_metrics, daily_metrics


def frame(pairs, day=date(2026, 1, 2), start="2026-01-02T00:00:00Z"):
    ts = pd.date_range(start, periods=len(pairs), freq="30min", tz="UTC")
    return pd.DataFrame({
        "start_time": ts, "delivery_date": day,
        "forecast_mw": pd.Series([p[0] for p in pairs], dtype="float64"),
        "actual_mw": pd.Series([p[1] for p in pairs], dtype="float64")})


def test_mae_rmse_bias_hand_computed():
    # errors (F-A): +10, -20, +30, 0 -> MAE 15, RMSE sqrt((100+400+900+0)/4)=sqrt(350), bias 5
    m = compute_metrics(frame([(110, 100), (80, 100), (130, 100), (50, 50)]))
    assert m["n_valid"] == 4
    assert m["mae"] == pytest.approx(15.0)
    assert m["rmse"] == pytest.approx(math.sqrt(350))
    assert m["bias"] == pytest.approx(5.0)
    assert (m["n_overestimated"], m["n_underestimated"], m["n_exact"]) == (2, 1, 1)
    assert m["max_abs_error"] == 30
    assert m["max_abs_error_time"] == pd.Timestamp("2026-01-02T01:00:00Z")


def test_sign_convention_over_is_positive_bias():
    assert compute_metrics(frame([(150, 100)]))["bias"] > 0
    assert compute_metrics(frame([(50, 100)]))["bias"] < 0


def test_missing_values_are_excluded_not_zero():
    nan = float("nan")
    m = compute_metrics(frame([(110, 100), (nan, 100), (120, nan), (nan, nan)]))
    assert m["n_expected"] == 4 and m["n_valid"] == 1
    assert m["n_missing_forecast"] == 2 and m["n_missing_actual"] == 2
    assert m["mae"] == 10 and m["bias"] == 10  # zero-filling would change both
    assert m["coverage_pct"] == 25.0


def test_empty_and_all_missing_return_none_metrics():
    for df in (frame([]), frame([(float("nan"), 1.0)])):
        m = compute_metrics(df)
        assert m["n_valid"] == 0
        assert m["mae"] is None and m["rmse"] is None and m["bias"] is None
        assert m["max_abs_error"] is None


def test_mape_excludes_near_zero_actuals():
    m = compute_metrics(frame([(110, 100), (5, 0), (1, 50)]), mape_min_actual_mw=10)
    assert m["mape_n"] == 2
    assert m["mape_pct"] == pytest.approx((10 / 100 + 49 / 50) / 2 * 100)


def test_rmse_ge_mae():
    m = compute_metrics(frame([(100, 90), (200, 100), (60, 100)]))
    assert m["rmse"] >= m["mae"]


def test_daily_metrics_groups_by_date_and_flags_status():
    a = frame([(110, 100)] * 3, day=date(2026, 1, 2))
    b = frame([(90, 100)] * 2, day=date(2026, 1, 3), start="2026-01-03T00:00:00Z")
    c = frame([(float("nan"), 100)], day=date(2026, 1, 4), start="2026-01-04T00:00:00Z")
    rows = daily_metrics(pd.concat([a, b, c]), min_valid=3)
    assert [r["date"] for r in rows] == [date(2026, 1, 2), date(2026, 1, 3), date(2026, 1, 4)]
    assert [r["status"] for r in rows] == ["ok", "low_sample", "no_data"]
    assert rows[0]["bias"] == 10 and rows[1]["bias"] == -10 and rows[2]["mae"] is None
