from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.config import get_settings
from app.services.cache import FileCache
from app.services.elexon_client import ElexonClient
from app.services.forecast_service import DataUnavailable, ForecastService

log = logging.getLogger("app")


def build_service() -> ForecastService:
    s = get_settings()
    client = ElexonClient(s.elexon_base_url, s.elexon_timeout_seconds,
                          s.elexon_max_retries, s.elexon_chunk_days)
    return ForecastService(s, client, FileCache(s.cache_dir))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not hasattr(app.state, "forecast_service"):
        app.state.forecast_service = build_service()

        def warm() -> None:  # prefetch so the first dashboard load is fast
            try:
                app.state.forecast_service.get_dataset()
            except DataUnavailable as exc:
                log.warning("Warm-up failed: %s", exc)

        threading.Thread(target=warm, daemon=True).start()
    yield


app = FastAPI(
    title="Wind Forecast Intelligence API",
    description="Wind forecast vs actual accuracy analysis from Elexon BMRS data.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(router)


@app.exception_handler(DataUnavailable)
async def _unavailable(_: Request, exc: DataUnavailable) -> JSONResponse:
    # Message is generic on purpose: no upstream URLs or internal details.
    return JSONResponse(status_code=503, content={
        "detail": "Elexon data is currently unavailable and no cached copy exists. Please retry shortly."})


@app.get("/")
def root() -> dict:
    return {"service": "Wind Forecast Intelligence API", "docs": "/docs", "health": "/api/health"}
