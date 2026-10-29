"""Turns matched records into the analysis payload (summary + daily breakdown)."""
from __future__ import annotations

import pandas as pd

from app.analytics.metrics import compute_metrics, daily_metrics
from app.config import Settings


def analyse(records: pd.DataFrame, settings: Settings) -> dict:
    summary = compute_metrics(records, settings.mape_min_actual_mw)
    daily = daily_metrics(records, settings.mape_min_actual_mw, settings.min_valid_periods_per_day)
    return {"summary": summary, "daily": daily}
