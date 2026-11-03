"""Pydantic response schemas. Error convention everywhere: forecast - actual (MW)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

ForecastMode = Literal["decision", "latest"]


class HealthResponse(BaseModel):
    status: Literal["ok"]


class ForecastRecord(BaseModel):
    delivery_time: datetime = Field(description="Delivery period start (UTC)")
    delivery_date: date = Field(description="Market-local (Europe/London) delivery date")
    forecast_mw: Optional[float]
    forecast_publish_time: Optional[datetime]
    cutoff_time: datetime = Field(description="Decision cutoff applied to this period (UTC)")
    lead_time_hours: Optional[float] = Field(
        description="Delivery start minus forecast publish time; negative = published after delivery began")
    forecast_filled: bool = Field(description="True if an hourly forecast was held onto a :30 period")
    actual_mw: Optional[float]
    error_mw: Optional[float] = Field(description="forecast_mw - actual_mw; null unless both exist")


class ForecastsResponse(BaseModel):
    mode: ForecastMode
    start: date
    end: date
    count: int
    records: list[ForecastRecord]


class Summary(BaseModel):
    n_expected: int
    n_valid: int
    n_missing_forecast: int
    n_missing_actual: int
    coverage_pct: float
    mae: Optional[float]
    rmse: Optional[float]
    bias: Optional[float]
    mape_pct: Optional[float]
    mape_n: int
    n_overestimated: int
    n_underestimated: int
    n_exact: int
    max_abs_error: Optional[float]
    max_abs_error_time: Optional[datetime]


class DailySummary(Summary):
    date: date
    status: Literal["ok", "low_sample", "no_data"]


class AnalysisResponse(BaseModel):
    mode: ForecastMode
    start: date
    end: date
    summary: Summary
    daily: list[DailySummary]
    data_source: Literal["live", "cache", "stale_cache"]
    data_fetched_at: datetime


class DataSourceInfo(BaseModel):
    name: str
    dataset: str
    description: str
    documentation_url: str
    rows_retrieved: int
    invalid_rows_dropped: int
    duplicates_dropped: int


class MetadataResponse(BaseModel):
    timezone: str
    analysis_start: date
    analysis_end: date
    expected_periods: int
    decision_cutoff_time: str
    decision_cutoff_days_ahead: int
    decision_cutoff_description: str
    cutoff_is_assumption: bool
    hourly_forecast_fill: Literal["none", "hold"]
    forecast_native_resolution_minutes: int
    min_valid_periods_per_day: int
    mape_min_actual_mw: float
    data_sources: list[DataSourceInfo]
    data_source: Literal["live", "cache", "stale_cache"]
    data_fetched_at: datetime
    data_is_stale: bool


class ErrorResponse(BaseModel):
    detail: str
