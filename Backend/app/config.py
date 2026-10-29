"""Application settings, loaded from environment variables (see .env.example)."""
from __future__ import annotations

from datetime import date, time
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Elexon BMRS (public API, no key required) ---
    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_seconds: float = 60.0
    elexon_max_retries: int = 4
    elexon_chunk_days: int = 7

    # --- Analysis scope (pilot: January 2026) ---
    analysis_start: date = date(2026, 1, 1)
    analysis_end: date = date(2026, 1, 31)
    market_timezone: str = "Europe/London"

    # --- Day-ahead decision cutoff (ASSUMPTION, not an official market rule) ---
    # Forecast must be published at or before <DECISION_CUTOFF_TIME> local time,
    # <DECISION_CUTOFF_DAYS_AHEAD> calendar days before the delivery date.
    decision_cutoff_time: time = time(9, 0)
    decision_cutoff_days_ahead: int = 1

    # WINDFOR is published at hourly resolution. "none" matches strictly on
    # startTime (the :30 half-hours get no forecast). "hold" re-uses the forecast
    # for the hour containing the half-hour period and marks it as filled.
    hourly_forecast_fill: Literal["none", "hold"] = "none"

    # Extra publish-time window fetched around the analysis period so that
    # decision-time forecasts for early targets, and later revisions, are present.
    forecast_lookback_days: int = 5
    forecast_forward_days: int = 2

    # --- Metrics ---
    mape_min_actual_mw: float = 100.0
    min_valid_periods_per_day: int = 12

    # --- Cache (file-based; ephemeral on most PaaS hosts) ---
    cache_dir: str = ".cache"
    cache_ttl_hours: float = 24.0

    # --- CORS: comma-separated list of allowed frontend origins ---
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    @field_validator("decision_cutoff_days_ahead")
    @classmethod
    def _non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("decision_cutoff_days_ahead must be >= 0")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
