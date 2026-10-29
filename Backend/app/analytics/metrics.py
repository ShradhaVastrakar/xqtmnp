"""Forecast accuracy metrics. Error convention: error = forecast - actual.

Positive error = overestimation, negative = underestimation. Only rows with both a
forecast and an actual are used; missing values are excluded, never treated as 0.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def valid_rows(records: pd.DataFrame) -> pd.DataFrame:
    return records[records["forecast_mw"].notna() & records["actual_mw"].notna()]


def compute_metrics(
    records: pd.DataFrame, mape_min_actual_mw: float = 100.0
) -> dict[str, Any]:
    """Aggregate metrics over a records frame (one row per expected period)."""
    n_expected = len(records)
    valid = valid_rows(records)
    n = len(valid)
    out: dict[str, Any] = {
        "n_expected": n_expected,
        "n_valid": n,
        "n_missing_forecast": int(records["forecast_mw"].isna().sum()),
        "n_missing_actual": int(records["actual_mw"].isna().sum()),
        "coverage_pct": round(100.0 * n / n_expected, 2) if n_expected else 0.0,
        "mae": None,
        "rmse": None,
        "bias": None,
        "mape_pct": None,
        "mape_n": 0,
        "n_overestimated": 0,
        "n_underestimated": 0,
        "n_exact": 0,
        "max_abs_error": None,
        "max_abs_error_time": None,
    }
    if n == 0:
        return out

    err = (valid["forecast_mw"] - valid["actual_mw"]).to_numpy(dtype=float)
    out["mae"] = float(np.mean(np.abs(err)))
    out["rmse"] = float(np.sqrt(np.mean(err**2)))
    out["bias"] = float(np.mean(err))
    out["n_overestimated"] = int((err > 0).sum())
    out["n_underestimated"] = int((err < 0).sum())
    out["n_exact"] = int((err == 0).sum())
    i = int(np.argmax(np.abs(err)))
    out["max_abs_error"] = float(abs(err[i]))
    out["max_abs_error_time"] = valid["start_time"].iloc[i]

    # MAPE: exclude near-zero actuals, where the percentage is unstable.
    a = valid["actual_mw"].to_numpy(dtype=float)
    mask = np.abs(a) >= mape_min_actual_mw
    out["mape_n"] = int(mask.sum())
    if mask.any():
        out["mape_pct"] = float(np.mean(np.abs(err[mask]) / np.abs(a[mask])) * 100.0)
    return out


def daily_metrics(
    records: pd.DataFrame, mape_min_actual_mw: float = 100.0, min_valid: int = 12
) -> list[dict[str, Any]]:
    """Per local delivery date metrics, in date order."""
    rows = []
    for d, g in records.groupby("delivery_date", sort=True):
        m = compute_metrics(g, mape_min_actual_mw)
        m["date"] = d
        if m["n_valid"] == 0:
            m["status"] = "no_data"
        elif m["n_valid"] < min_valid:
            m["status"] = "low_sample"
        else:
            m["status"] = "ok"
        rows.append(m)
    return rows
