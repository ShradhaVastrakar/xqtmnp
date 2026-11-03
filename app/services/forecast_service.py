"""Loads, caches and serves wind forecast/actual data; builds matched records."""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from app.analytics.selection import Mode, build_records
from app.analytics.timeutil import local_midnight_utc
from app.config import Settings
from app.services.cache import FileCache
from app.services.elexon_client import ElexonClient, ElexonError
from app.services.normalisation import normalise_actuals, normalise_forecasts

log = logging.getLogger(__name__)


@dataclass
class Dataset:
    forecasts: pd.DataFrame
    actuals: pd.DataFrame
    fetched_at: datetime
    source: str  # "live" | "cache" | "stale_cache"
    quality: dict


class DataUnavailable(RuntimeError):
    """Elexon could not be reached and no cached copy exists."""


class ForecastService:
    def __init__(self, settings: Settings, client: ElexonClient, cache: FileCache,
                 now=lambda: datetime.now(timezone.utc)) -> None:
        self.s = settings
        self.tz = ZoneInfo(settings.market_timezone)
        self._client = client
        self._cache = cache
        self._now = now
        self._lock = threading.Lock()
        self._dataset: Dataset | None = None

    # -- loading ---------------------------------------------------------------
    def _publish_window(self) -> tuple[datetime, datetime]:
        lo = local_midnight_utc(self.s.analysis_start, self.tz) - timedelta(
            days=self.s.forecast_lookback_days)
        hi = local_midnight_utc(self.s.analysis_end + timedelta(days=1), self.tz) + timedelta(
            days=self.s.forecast_forward_days)
        return lo, hi

    def _fingerprint(self) -> str:
        lo, hi = self._publish_window()
        return f"{self.s.analysis_start}|{self.s.analysis_end}|{lo.isoformat()}|{hi.isoformat()}"

    def _build(self, f_rows: list, a_rows: list, fetched_at: datetime, source: str) -> Dataset:
        forecasts, fq = normalise_forecasts(f_rows)
        actuals, aq = normalise_actuals(a_rows)
        return Dataset(forecasts, actuals, fetched_at, source,
                       {"forecasts": fq, "actuals": aq})

    def get_dataset(self) -> Dataset:
        """Return the in-memory dataset, refreshing it from cache/Elexon when stale."""
        with self._lock:
            ds = self._dataset
            ttl = timedelta(hours=self.s.cache_ttl_hours)
            if ds is not None and ds.source != "stale_cache" and self._now() - ds.fetched_at < ttl:
                return ds
            self._dataset = self._load(previous=ds)
            return self._dataset

    def _load(self, previous: Dataset | None) -> Dataset:
        fp = self._fingerprint()
        cached = self._cache.load(fp)
        ttl = timedelta(hours=self.s.cache_ttl_hours)
        if cached and self._now() - cached["fetched_at"] < ttl:
            return self._build(cached["forecasts"], cached["actuals"], cached["fetched_at"], "cache")
        try:
            lo, hi = self._publish_window()
            f_rows = self._client.fetch_wind_forecasts(lo, hi)
            a_rows = self._client.fetch_actual_wind(self.s.analysis_start, self.s.analysis_end)
            if not f_rows and not a_rows:
                raise ElexonError("Elexon returned no data for the requested period")
        except ElexonError as exc:
            log.warning("Elexon retrieval failed: %s", exc)
            if cached:  # serve stale data rather than fail, but flag it
                return self._build(cached["forecasts"], cached["actuals"],
                                   cached["fetched_at"], "stale_cache")
            if previous is not None:
                previous.source = "stale_cache"
                return previous
            raise DataUnavailable(str(exc)) from exc
        fetched_at = self._now()
        self._cache.save(fp, f_rows, a_rows, fetched_at)
        return self._build(f_rows, a_rows, fetched_at, "live")

    # -- queries ---------------------------------------------------------------
    def records(self, start: date, end: date, mode: Mode) -> tuple[pd.DataFrame, Dataset]:
        ds = self.get_dataset()
        df = build_records(
            ds.forecasts, ds.actuals, start, end, mode, self.tz,
            self.s.decision_cutoff_time, self.s.decision_cutoff_days_ahead,
            self.s.hourly_forecast_fill,
        )
        return df, ds
