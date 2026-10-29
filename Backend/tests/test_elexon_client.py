import json
from datetime import date, datetime, timezone

import httpx
import pytest

from app.services.elexon_client import ElexonClient, ElexonError


def make(handler, **kw):
    return ElexonClient("https://example.test/api", transport=httpx.MockTransport(handler),
                        sleep=lambda s: None, **kw)


def test_forecast_fetch_chunks_publish_range_and_concatenates():
    calls = []

    def handler(req):
        calls.append(dict(req.url.params))
        return httpx.Response(200, json=[{"n": len(calls)}])

    rows = make(handler, chunk_days=7).fetch_wind_forecasts(
        datetime(2026, 1, 1, tzinfo=timezone.utc), datetime(2026, 1, 16, tzinfo=timezone.utc))
    assert len(calls) == 3 and len(rows) == 3
    assert calls[0] == {"publishDateTimeFrom": "2026-01-01T00:00:00Z",
                        "publishDateTimeTo": "2026-01-08T00:00:00Z"}
    assert calls[2]["publishDateTimeTo"] == "2026-01-16T00:00:00Z"


def test_actual_fetch_uses_inclusive_non_overlapping_date_chunks_and_wind_filter():
    calls = []

    def handler(req):
        calls.append(dict(req.url.params))
        return httpx.Response(200, json=[])

    make(handler, chunk_days=10).fetch_actual_wind(date(2026, 1, 1), date(2026, 1, 31))
    ranges = [(c["settlementDateFrom"], c["settlementDateTo"]) for c in calls]
    assert ranges == [("2026-01-01", "2026-01-10"), ("2026-01-11", "2026-01-20"),
                      ("2026-01-21", "2026-01-30"), ("2026-01-31", "2026-01-31")]
    assert all(c["fuelType"] == "WIND" for c in calls)


def test_retries_on_429_then_succeeds():
    seq = iter([httpx.Response(429, headers={"Retry-After": "1"}),
                httpx.Response(503), httpx.Response(200, json=[{"ok": 1}])])
    c = make(lambda req: next(seq))
    assert c.fetch_actual_wind(date(2026, 1, 1), date(2026, 1, 1)) == [{"ok": 1}]


def test_gives_up_after_max_retries():
    n = {"i": 0}

    def handler(req):
        n["i"] += 1
        return httpx.Response(500)

    with pytest.raises(ElexonError, match="after retries"):
        make(handler, max_retries=2).fetch_actual_wind(date(2026, 1, 1), date(2026, 1, 1))
    assert n["i"] == 3


def test_client_error_is_not_retried():
    n = {"i": 0}

    def handler(req):
        n["i"] += 1
        return httpx.Response(400)

    with pytest.raises(ElexonError, match="HTTP 400"):
        make(handler).fetch_actual_wind(date(2026, 1, 1), date(2026, 1, 1))
    assert n["i"] == 1


def test_network_error_is_wrapped():
    def handler(req):
        raise httpx.ConnectError("boom")

    with pytest.raises(ElexonError):
        make(handler, max_retries=1).fetch_actual_wind(date(2026, 1, 1), date(2026, 1, 1))


@pytest.mark.parametrize("body", [b"<html>", json.dumps({"a": 1}).encode()])
def test_malformed_body_raises(body):
    with pytest.raises(ElexonError):
        make(lambda r: httpx.Response(200, content=body)).fetch_actual_wind(
            date(2026, 1, 1), date(2026, 1, 1))
