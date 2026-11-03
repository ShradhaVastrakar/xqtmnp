"""API tests use a fake Elexon client returning synthetic fixture rows."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.cache import FileCache
from app.services.elexon_client import ElexonError
from app.services.forecast_service import ForecastService
from tests.conftest import raw_actual, raw_forecast


class FakeClient:
    def __init__(self, forecasts=(), actuals=(), error=None):
        self.f, self.a, self.error, self.calls = list(forecasts), list(actuals), error, 0

    def fetch_wind_forecasts(self, lo, hi):
        self.calls += 1
        if self.error:
            raise self.error
        return self.f

    def fetch_actual_wind(self, start, end):
        if self.error:
            raise self.error
        return self.a


# Synthetic: 2 Jan 00:00Z forecast 100 (pre-cutoff) / 500 (post-cutoff); actual 80.
FORECASTS = [
    raw_forecast("2026-01-02T00:00:00Z", "2026-01-01T07:30:00Z", 100),
    raw_forecast("2026-01-02T00:00:00Z", "2026-01-01T11:30:00Z", 500),
    raw_forecast("2026-01-02T01:00:00Z", "2026-01-01T07:30:00Z", 70),
]
ACTUALS = [raw_actual("2026-01-02T00:00:00Z", 80), raw_actual("2026-01-02T01:00:00Z", 90),
           raw_actual("2026-01-02T00:30:00Z", 85)]


def client_for(settings, fake):
    svc = ForecastService(settings, fake, FileCache(settings.cache_dir))
    app.state.forecast_service = svc
    return TestClient(app), svc


@pytest.fixture
def api(settings):
    c, _ = client_for(settings, FakeClient(FORECASTS, ACTUALS))
    with c:
        yield c


def test_health(api):
    assert api.get("/api/health").json() == {"status": "ok"}


def test_forecasts_decision_vs_latest(api):
    q = {"start": "2026-01-02", "end": "2026-01-02"}
    dec = api.get("/api/forecasts", params={**q, "mode": "decision"}).json()
    lat = api.get("/api/forecasts", params={**q, "mode": "latest"}).json()
    assert dec["count"] == lat["count"] == 48
    d0, l0 = dec["records"][0], lat["records"][0]
    assert d0["forecast_mw"] == 100 and d0["error_mw"] == 20
    assert d0["forecast_publish_time"] == "2026-01-01T07:30:00Z"
    assert d0["cutoff_time"] == "2026-01-01T09:00:00Z"
    assert l0["forecast_mw"] == 500 and l0["error_mw"] == 420
    # half-hour with actual but no forecast: nulls, not zeros
    d1 = dec["records"][1]
    assert d1["actual_mw"] == 85 and d1["forecast_mw"] is None and d1["error_mw"] is None


def test_default_mode_is_decision(api):
    r = api.get("/api/forecasts", params={"start": "2026-01-02", "end": "2026-01-02"}).json()
    assert r["mode"] == "decision"


def test_analysis_metrics_and_coverage(api):
    r = api.get("/api/analysis", params={"start": "2026-01-02", "end": "2026-01-02"}).json()
    s = r["summary"]
    # valid pairs: (100,80) -> +20 ; (70,90) -> -20
    assert s["n_valid"] == 2 and s["n_expected"] == 48
    assert s["mae"] == 20 and s["bias"] == 0 and s["rmse"] == 20
    assert s["n_missing_forecast"] == 46 and s["n_missing_actual"] == 45
    assert s["coverage_pct"] == pytest.approx(4.17, abs=0.01)
    assert len(r["daily"]) == 1 and r["daily"][0]["status"] == "low_sample"
    assert r["data_source"] == "live"


def test_analysis_full_default_range_has_31_daily_rows_and_nulls_for_empty_days(api):
    r = api.get("/api/analysis").json()
    assert r["summary"]["n_expected"] == 1488 and len(r["daily"]) == 31
    empty = [d for d in r["daily"] if d["date"] == "2026-01-10"][0]
    assert empty["status"] == "no_data" and empty["mae"] is None


def test_metadata(api):
    m = api.get("/api/metadata").json()
    assert m["timezone"] == "Europe/London" and m["decision_cutoff_time"] == "09:00"
    assert m["cutoff_is_assumption"] is True and m["expected_periods"] == 1488
    assert m["data_source"] == "live" and m["data_is_stale"] is False
    assert {s["dataset"] for s in m["data_sources"]} == {"FUELHH", "WINDFOR"}
    assert "/home" not in str(m) and "/tmp" not in str(m)  # no filesystem paths


@pytest.mark.parametrize("params,msg", [
    ({"start": "2026-01-10", "end": "2026-01-05"}, "on or before"),
    ({"start": "2025-12-31", "end": "2026-01-05"}, "within"),
    ({"start": "2026-01-05", "end": "2026-02-01"}, "within"),
])
def test_invalid_date_ranges_422(api, params, msg):
    for path in ("/api/forecasts", "/api/analysis"):
        r = api.get(path, params=params)
        assert r.status_code == 422 and msg in r.json()["detail"]


@pytest.mark.parametrize("params", [{"start": "not-a-date"}, {"mode": "bogus"}])
def test_invalid_parameter_values_422(api, params):
    assert api.get("/api/analysis", params=params).status_code == 422


def test_upstream_failure_without_cache_returns_503(settings):
    c, _ = client_for(settings, FakeClient(error=ElexonError("secret upstream detail")))
    with c:
        for path in ("/api/analysis", "/api/forecasts", "/api/metadata"):
            r = c.get(path)
            assert r.status_code == 503
            assert "secret" not in r.text and "unavailable" in r.json()["detail"]
        assert c.get("/api/health").status_code == 200  # health never depends on Elexon


def test_empty_upstream_dataset_is_reported_as_unavailable(settings):
    c, _ = client_for(settings, FakeClient([], []))
    with c:
        assert c.get("/api/analysis").status_code == 503


def test_upstream_data_with_no_overlap_gives_zero_valid(settings):
    c, _ = client_for(settings, FakeClient(
        [raw_forecast("2026-01-02T00:00:00Z", "2026-01-01T07:30:00Z", 100)],
        [raw_actual("2026-01-03T00:00:00Z", 80)]))
    with c:
        s = c.get("/api/analysis").json()["summary"]
    assert s["n_valid"] == 0 and s["mae"] is None and s["coverage_pct"] == 0
