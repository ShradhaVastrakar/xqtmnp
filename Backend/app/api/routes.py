from datetime import date
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.analytics.timeutil import expected_periods
from app.config import Settings, get_settings
from app.models.schemas import (AnalysisResponse, DataSourceInfo, ErrorResponse, ForecastMode,
                                ForecastsResponse, HealthResponse, MetadataResponse)
from app.services.analysis_service import analyse
from app.services.forecast_service import ForecastService

router = APIRouter(prefix="/api")

_UNAVAILABLE = {503: {"model": ErrorResponse, "description": "Upstream Elexon data unavailable"},
                422: {"model": ErrorResponse, "description": "Invalid parameters"}}


def get_service(request: Request) -> ForecastService:
    return request.app.state.forecast_service


class DateRange:
    """Validated ``start``/``end`` query parameters (market-local dates)."""

    def __init__(
        self,
        settings: Annotated[Settings, Depends(get_settings)],
        start: Annotated[date | None, Query(description="First delivery date, YYYY-MM-DD")] = None,
        end: Annotated[date | None, Query(description="Last delivery date, YYYY-MM-DD")] = None,
    ) -> None:
        self.start = start or settings.analysis_start
        self.end = end or settings.analysis_end
        if self.start > self.end:
            raise HTTPException(422, "start must be on or before end")
        if self.start < settings.analysis_start or self.end > settings.analysis_end:
            raise HTTPException(
                422, f"Dates must be within {settings.analysis_start} to {settings.analysis_end}")


Range = Annotated[DateRange, Depends()]
Service = Annotated[ForecastService, Depends(get_service)]
ModeQuery = Annotated[ForecastMode, Query(description="decision = latest forecast at or before "
                                          "the day-ahead cutoff; latest = newest forecast retrieved")]


def _clean(v):
    """NaN/NaT -> None for JSON."""
    return None if v is None or (not isinstance(v, (str, bool)) and pd.isna(v)) else v


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/metadata", response_model=MetadataResponse, responses=_UNAVAILABLE)
def metadata(service: Service) -> MetadataResponse:
    s, ds = service.s, service.get_dataset()
    cutoff = s.decision_cutoff_time.strftime("%H:%M")
    day_word = "the day before" if s.decision_cutoff_days_ahead == 1 else \
        f"{s.decision_cutoff_days_ahead} days before"
    return MetadataResponse(
        timezone=s.market_timezone,
        analysis_start=s.analysis_start,
        analysis_end=s.analysis_end,
        expected_periods=len(expected_periods(s.analysis_start, s.analysis_end, service.tz)),
        decision_cutoff_time=cutoff,
        decision_cutoff_days_ahead=s.decision_cutoff_days_ahead,
        decision_cutoff_description=(
            f"{cutoff} {s.market_timezone} on {day_word} the delivery date. "
            "Pilot assumption approximating a GB day-ahead auction gate; not an official market rule."),
        cutoff_is_assumption=True,
        hourly_forecast_fill=s.hourly_forecast_fill,
        forecast_native_resolution_minutes=60,
        min_valid_periods_per_day=s.min_valid_periods_per_day,
        mape_min_actual_mw=s.mape_min_actual_mw,
        data_sources=[
            DataSourceInfo(
                name="Elexon BMRS", dataset="FUELHH",
                description="Actual half-hourly wind generation outturn (fuelType = WIND)",
                documentation_url="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
                rows_retrieved=ds.quality["actuals"]["raw_rows"],
                invalid_rows_dropped=ds.quality["actuals"]["invalid_rows_dropped"],
                duplicates_dropped=ds.quality["actuals"]["duplicates_dropped"]),
            DataSourceInfo(
                name="Elexon BMRS", dataset="WINDFOR",
                description="Hourly wind generation forecasts with publish times",
                documentation_url="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
                rows_retrieved=ds.quality["forecasts"]["raw_rows"],
                invalid_rows_dropped=ds.quality["forecasts"]["invalid_rows_dropped"],
                duplicates_dropped=ds.quality["forecasts"]["duplicates_dropped"]),
        ],
        data_source=ds.source,
        data_fetched_at=ds.fetched_at,
        data_is_stale=ds.source == "stale_cache",
    )


@router.get("/forecasts", response_model=ForecastsResponse, responses=_UNAVAILABLE)
def forecasts(service: Service, rng: Range, mode: ModeQuery = "decision") -> ForecastsResponse:
    df, _ = service.records(rng.start, rng.end, mode)
    records = [
        {
            "delivery_time": r.start_time.to_pydatetime(),
            "delivery_date": r.delivery_date,
            "forecast_mw": _clean(r.forecast_mw),
            "forecast_publish_time": None if pd.isna(r.forecast_publish_time)
            else r.forecast_publish_time.to_pydatetime(),
            "cutoff_time": r.cutoff_time.to_pydatetime(),
            "lead_time_hours": _clean(r.lead_time_hours),
            "forecast_filled": bool(r.forecast_filled),
            "actual_mw": _clean(r.actual_mw),
            "error_mw": _clean(r.error_mw),
        }
        for r in df.itertuples(index=False)
    ]
    return ForecastsResponse(mode=mode, start=rng.start, end=rng.end, count=len(records),
                             records=records)


@router.get("/analysis", response_model=AnalysisResponse, responses=_UNAVAILABLE)
def analysis(service: Service, rng: Range, mode: ModeQuery = "decision") -> AnalysisResponse:
    df, ds = service.records(rng.start, rng.end, mode)
    result = analyse(df, service.s)
    for row in [result["summary"], *result["daily"]]:
        t = row.get("max_abs_error_time")
        row["max_abs_error_time"] = None if t is None else t.to_pydatetime()
    return AnalysisResponse(mode=mode, start=rng.start, end=rng.end, summary=result["summary"],
                            daily=result["daily"], data_source=ds.source,
                            data_fetched_at=ds.fetched_at)
