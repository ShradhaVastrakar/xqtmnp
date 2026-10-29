"""Clean raw Elexon rows into typed UTC frames and report data-quality counts."""
from __future__ import annotations

from typing import Any

import pandas as pd


def _numeric_generation(df: pd.DataFrame) -> pd.Series:
    return pd.to_numeric(df.get("generation"), errors="coerce")


def normalise_forecasts(rows: list[dict[str, Any]]) -> tuple[pd.DataFrame, dict[str, int]]:
    cols = ["start_time", "publish_time", "generation"]
    q = {"raw_rows": len(rows), "invalid_rows_dropped": 0, "duplicates_dropped": 0}
    if not rows:
        return pd.DataFrame({c: pd.Series(dtype="float64") for c in cols}).astype(
            {"start_time": "datetime64[ns, UTC]", "publish_time": "datetime64[ns, UTC]"}
        ), q
    raw = pd.DataFrame(rows)
    df = pd.DataFrame(
        {
            "start_time": pd.to_datetime(raw.get("startTime"), utc=True, errors="coerce"),
            "publish_time": pd.to_datetime(raw.get("publishTime"), utc=True, errors="coerce"),
            "generation": _numeric_generation(raw),
        }
    )
    ok = df.notna().all(axis=1) & (df["generation"] >= 0)
    q["invalid_rows_dropped"] = int((~ok).sum())
    df = df[ok]
    before = len(df)
    df = df.drop_duplicates(["start_time", "publish_time"], keep="last")
    q["duplicates_dropped"] = before - len(df)
    return df.sort_values(["start_time", "publish_time"]).reset_index(drop=True), q


def normalise_actuals(rows: list[dict[str, Any]]) -> tuple[pd.DataFrame, dict[str, int]]:
    cols = ["start_time", "generation"]
    q = {"raw_rows": len(rows), "invalid_rows_dropped": 0, "duplicates_dropped": 0}
    if not rows:
        return pd.DataFrame({c: pd.Series(dtype="float64") for c in cols}).astype(
            {"start_time": "datetime64[ns, UTC]"}
        ), q
    raw = pd.DataFrame(rows)
    if "fuelType" in raw:
        raw = raw[raw["fuelType"] == "WIND"]
    df = pd.DataFrame(
        {
            "start_time": pd.to_datetime(raw.get("startTime"), utc=True, errors="coerce"),
            "publish_time": pd.to_datetime(raw.get("publishTime"), utc=True, errors="coerce"),
            "generation": _numeric_generation(raw),
        }
    )
    ok = df["start_time"].notna() & df["generation"].notna() & (df["generation"] >= 0)
    q["invalid_rows_dropped"] = int(len(raw) - ok.sum())
    df = df[ok]
    before = len(df)
    # Duplicates for one period: keep the most recently published value.
    df = df.sort_values(["start_time", "publish_time"], na_position="first")
    df = df.drop_duplicates("start_time", keep="last")
    q["duplicates_dropped"] = before - len(df)
    return df[cols].reset_index(drop=True), q
