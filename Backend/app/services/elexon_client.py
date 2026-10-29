"""Thin client for the Elexon BMRS open-data API (no API key required).

Endpoints used (verified against https://data.elexon.co.uk/swagger/v1/swagger.json):
  GET /datasets/WINDFOR/stream  publishDateTimeFrom/To (ISO date-time)
  GET /datasets/FUELHH/stream   settlementDateFrom/To (yyyy-MM-dd), fuelType[]

Both ``stream`` endpoints return a plain JSON array (no pagination envelope), so
retrieval is done by splitting the requested range into fixed-size chunks.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timedelta
from typing import Any, Callable

import httpx

log = logging.getLogger(__name__)

_RETRY_STATUS = {429, 500, 502, 503, 504}


class ElexonError(RuntimeError):
    """Raised when Elexon data cannot be retrieved after retries."""


class ElexonClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 60.0,
        max_retries: int = 4,
        chunk_days: int = 7,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout, transport=transport
        )
        self._max_retries = max_retries
        self._chunk_days = max(1, chunk_days)
        self._sleep = sleep

    def close(self) -> None:
        self._client.close()

    # -- low level -----------------------------------------------------------
    def _get_json(self, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        last: str = ""
        for attempt in range(self._max_retries + 1):
            try:
                resp = self._client.get(path, params=params)
            except httpx.HTTPError as exc:
                last = f"{type(exc).__name__}"
            else:
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                    except ValueError as exc:
                        raise ElexonError("Elexon returned invalid JSON") from exc
                    if not isinstance(data, list):
                        raise ElexonError("Unexpected Elexon response shape (expected a list)")
                    return data
                if resp.status_code not in _RETRY_STATUS:
                    raise ElexonError(f"Elexon request failed with HTTP {resp.status_code}")
                last = f"HTTP {resp.status_code}"
                retry_after = resp.headers.get("Retry-After")
                if retry_after and retry_after.isdigit() and attempt < self._max_retries:
                    self._sleep(min(float(retry_after), 30.0))
                    continue
            if attempt < self._max_retries:
                self._sleep(min(2.0**attempt, 20.0))
        raise ElexonError(f"Elexon request failed after retries ({last})")

    # -- datasets ------------------------------------------------------------
    def fetch_wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> list[dict]:
        """WINDFOR rows published in [publish_from, publish_to) (tz-aware datetimes)."""
        rows: list[dict] = []
        cur = publish_from
        while cur < publish_to:
            nxt = min(cur + timedelta(days=self._chunk_days), publish_to)
            rows += self._get_json(
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": cur.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "publishDateTimeTo": nxt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                },
            )
            cur = nxt
        return rows

    def fetch_actual_wind(self, start: date, end: date) -> list[dict]:
        """FUELHH WIND rows for settlement dates start..end inclusive."""
        rows: list[dict] = []
        cur = start
        while cur <= end:
            nxt = min(cur + timedelta(days=self._chunk_days - 1), end)
            rows += self._get_json(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": cur.isoformat(),
                    "settlementDateTo": nxt.isoformat(),
                    "fuelType": "WIND",
                },
            )
            cur = nxt + timedelta(days=1)
        return rows
