"""Forecast selection: decision-time vs latest-available, matched to actuals.

Pure pandas logic with no I/O so it can be tested with small synthetic fixtures.

Input frames (all timestamps tz-aware UTC):
  forecasts: columns start_time, publish_time, generation
  actuals:   columns start_time, generation
"""
from __future__ import annotations

from datetime import time
from typing import Literal
from zoneinfo import ZoneInfo

import pandas as pd

from app.analytics.timeutil import decision_cutoff, expected_periods

Mode = Literal["decision", "latest"]

RECORD_COLUMNS = [
    "start_time",
    "delivery_date",
    "forecast_mw",
    "forecast_publish_time",
    "cutoff_time",
    "lead_time_hours",
    "forecast_filled",
    "actual_mw",
    "error_mw",
]


def pick_forecasts(
    forecasts: pd.DataFrame,
    targets: pd.Series,
    mode: Mode,
    tz: ZoneInfo,
    cutoff_time: time,
    days_ahead: int,
) -> pd.DataFrame:
    """For each forecast target start_time, pick one forecast row.

    decision: latest ``publish_time`` <= the day-ahead cutoff for the target's
              delivery date. Forecasts published after the cutoff are never used.
    latest:   latest ``publish_time`` present in the data, regardless of cutoff.

    Ties on identical (start_time, publish_time) are broken deterministically by
    keeping the last row in input order. Returns columns:
    start_time, forecast_mw, forecast_publish_time, cutoff_time.
    """
    out_cols = ["start_time", "forecast_mw", "forecast_publish_time", "cutoff_time"]
    if forecasts.empty or len(targets) == 0:
        return pd.DataFrame({
            "start_time": pd.Series(dtype="datetime64[ns, UTC]"),
            "forecast_mw": pd.Series(dtype="float64"),
            "forecast_publish_time": pd.Series(dtype="datetime64[ns, UTC]"),
            "cutoff_time": pd.Series(dtype="datetime64[ns, UTC]"),
        })

    f = forecasts[forecasts["start_time"].isin(set(targets))].copy()
    f = f.drop_duplicates(["start_time", "publish_time"], keep="last")

    cutoffs = {
        d: decision_cutoff(d, tz, cutoff_time, days_ahead)
        for d in f["start_time"].dt.tz_convert(tz).dt.date.unique()
    }
    f["cutoff_time"] = pd.to_datetime(
        f["start_time"].dt.tz_convert(tz).dt.date.map(cutoffs), utc=True
    )
    if mode == "decision":
        f = f[f["publish_time"] <= f["cutoff_time"]]

    f = f.sort_values(["start_time", "publish_time"], kind="stable")
    f = f.groupby("start_time", as_index=False).tail(1)
    return f.rename(
        columns={"generation": "forecast_mw", "publish_time": "forecast_publish_time"}
    )[out_cols].reset_index(drop=True)


def build_records(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    start,
    end,
    mode: Mode,
    tz: ZoneInfo,
    cutoff_time: time,
    days_ahead: int,
    hourly_fill: Literal["none", "hold"] = "none",
) -> pd.DataFrame:
    """One row per expected half-hourly period in [start, end] (local dates).

    Missing forecasts/actuals stay NaN/NaT - never zero. ``error_mw`` (forecast
    minus actual) is only set when both values are present.
    """
    periods = expected_periods(start, end, tz)
    base = pd.DataFrame({"start_time": periods})
    base["delivery_date"] = base["start_time"].dt.tz_convert(tz).dt.date

    # Forecast key: the period itself, or (hold mode) the containing hour.
    if hourly_fill == "hold":
        base["_fkey"] = base["start_time"].dt.floor("h")
    else:
        base["_fkey"] = base["start_time"]

    picked = pick_forecasts(
        forecasts, base["_fkey"].drop_duplicates(), mode, tz, cutoff_time, days_ahead
    ).rename(columns={"start_time": "_fkey"})

    df = base.merge(picked, on="_fkey", how="left")
    # In hold mode, only periods whose own start differs from the key are "filled".
    df["forecast_filled"] = (df["_fkey"] != df["start_time"]) & df["forecast_mw"].notna()

    act = (
        actuals.drop_duplicates("start_time", keep="last")
        .rename(columns={"generation": "actual_mw"})[["start_time", "actual_mw"]]
    )
    df = df.merge(act, on="start_time", how="left")

    # The cutoff column is informative even for periods with no eligible forecast.
    cut = {
        d: decision_cutoff(d, tz, cutoff_time, days_ahead)
        for d in df["delivery_date"].unique()
    }
    df["cutoff_time"] = pd.to_datetime(df["delivery_date"].map(cut), utc=True)

    df["forecast_mw"] = pd.to_numeric(df["forecast_mw"], errors="coerce")
    df["actual_mw"] = pd.to_numeric(df["actual_mw"], errors="coerce")
    df["error_mw"] = df["forecast_mw"] - df["actual_mw"]  # NaN if either is missing
    df["lead_time_hours"] = (
        df["start_time"] - df["forecast_publish_time"]
    ).dt.total_seconds() / 3600.0
    return df[RECORD_COLUMNS].sort_values("start_time").reset_index(drop=True)
