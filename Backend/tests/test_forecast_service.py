import os
from datetime import datetime, timedelta, timezone

import pytest

from app.services.cache import FileCache
from app.services.elexon_client import ElexonError
from app.services.forecast_service import DataUnavailable, ForecastService
from tests.test_api import ACTUALS, FORECASTS, FakeClient


class Clock:
    def __init__(self):
        self.t = datetime(2026, 10, 29, 12, tzinfo=timezone.utc)

    def __call__(self):
        return self.t


def svc(settings, fake, clock):
    return ForecastService(settings, fake, FileCache(settings.cache_dir), now=clock)


def test_live_fetch_then_served_from_memory_without_new_requests(settings):
    fake, clock = FakeClient(FORECASTS, ACTUALS), Clock()
    s = svc(settings, fake, clock)
    assert s.get_dataset().source == "live"
    s.get_dataset()
    assert fake.calls == 1


def test_new_process_uses_disk_cache_and_labels_it(settings):
    clock = Clock()
    svc(settings, FakeClient(FORECASTS, ACTUALS), clock).get_dataset()
    fake2 = FakeClient(error=ElexonError("should not be called"))
    ds = svc(settings, fake2, clock).get_dataset()
    assert ds.source == "cache" and fake2.calls == 0
    assert ds.fetched_at == datetime(2026, 10, 29, 12, tzinfo=timezone.utc)


def test_expired_cache_refetches(settings):
    clock = Clock()
    svc(settings, FakeClient(FORECASTS, ACTUALS), clock).get_dataset()
    clock.t += timedelta(hours=settings.cache_ttl_hours + 1)
    fake2 = FakeClient(FORECASTS, ACTUALS)
    assert svc(settings, fake2, clock).get_dataset().source == "live" and fake2.calls == 1


def test_expired_cache_with_upstream_failure_serves_stale_copy(settings):
    clock = Clock()
    svc(settings, FakeClient(FORECASTS, ACTUALS), clock).get_dataset()
    clock.t += timedelta(days=3)
    ds = svc(settings, FakeClient(error=ElexonError("down")), clock).get_dataset()
    assert ds.source == "stale_cache" and len(ds.forecasts) == 3


def test_no_cache_and_failure_raises(settings):
    with pytest.raises(DataUnavailable):
        svc(settings, FakeClient(error=ElexonError("down")), Clock()).get_dataset()


def test_cache_for_different_analysis_window_is_ignored(settings):
    clock = Clock()
    svc(settings, FakeClient(FORECASTS, ACTUALS), clock).get_dataset()
    other = settings.model_copy(update={"forecast_lookback_days": 9})
    assert svc(other, FakeClient(FORECASTS, ACTUALS), clock).get_dataset().source == "live"


def test_corrupt_cache_file_is_ignored(settings):
    os.makedirs(settings.cache_dir, exist_ok=True)
    with open(os.path.join(settings.cache_dir, "elexon_wind.json"), "w") as fh:
        fh.write("{not json")
    assert svc(settings, FakeClient(FORECASTS, ACTUALS), Clock()).get_dataset().source == "live"
