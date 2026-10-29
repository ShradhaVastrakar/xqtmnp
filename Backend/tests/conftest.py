"""Shared test fixtures.

ALL data in this test suite is small SYNTHETIC test-fixture data. It is not Elexon data.
"""
from __future__ import annotations

from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

import pandas as pd
import pytest

from app.config import Settings

LONDON = ZoneInfo("Europe/London")
CUTOFF = time(9, 0)


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def fc_frame(rows):
    """rows: (start, publish, generation) tuples of UTC datetimes."""
    df = pd.DataFrame(rows, columns=["start_time", "publish_time", "generation"])
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    return df


def act_frame(rows):
    df = pd.DataFrame(rows, columns=["start_time", "generation"])
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    return df


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(cache_dir=str(tmp_path / "cache"), _env_file=None)


def raw_forecast(start: str, publish: str, gen) -> dict:
    return {"dataset": "WINDFOR", "startTime": start, "publishTime": publish, "generation": gen}


def raw_actual(start: str, gen, publish: str = "2026-01-02T00:00:00Z", fuel="WIND") -> dict:
    return {"dataset": "FUELHH", "startTime": start, "publishTime": publish,
            "settlementDate": start[:10], "settlementPeriod": 1, "fuelType": fuel,
            "generation": gen}
