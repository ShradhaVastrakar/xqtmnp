"""Market-time helpers. All stored timestamps are UTC; market logic uses Europe/London."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

HALF_HOUR = timedelta(minutes=30)


def local_midnight_utc(d: date, tz: ZoneInfo) -> datetime:
    """UTC instant of local midnight at the start of ``d`` (DST-aware)."""
    return datetime.combine(d, time(0, 0), tzinfo=tz).astimezone(timezone.utc)


def expected_periods(start: date, end: date, tz: ZoneInfo) -> pd.DatetimeIndex:
    """All half-hourly delivery period starts (UTC) for local dates start..end inclusive.

    A normal day has 48 periods; clock-change days have 46 or 50.
    """
    lo = local_midnight_utc(start, tz)
    hi = local_midnight_utc(end + timedelta(days=1), tz)
    return pd.date_range(lo, hi, freq="30min", inclusive="left", tz="UTC")


def delivery_date(ts: datetime, tz: ZoneInfo) -> date:
    """Local (market) calendar date of a delivery period."""
    return ts.astimezone(tz).date()


def decision_cutoff(
    delivery: date, tz: ZoneInfo, cutoff_time: time, days_ahead: int
) -> datetime:
    """UTC instant of the decision cutoff for a given delivery date.

    ``cutoff_time`` is interpreted as local wall-clock time on ``delivery - days_ahead``.
    """
    local_day = delivery - timedelta(days=days_ahead)
    return datetime.combine(local_day, cutoff_time, tzinfo=tz).astimezone(timezone.utc)
