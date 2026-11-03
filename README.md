# Wind Forecast Intelligence Dashboard

A full-stack analytics dashboard for a UK electricity utility's procurement team. It shows the wind generation forecast that was **available at day-ahead decision time**, compares it with **actual** wind generation, and quantifies forecast accuracy (MAE, RMSE, bias) for **1–31 January 2026**, using real data from Elexon BMRS.

> **Status:** runs locally and via Docker Compose (both verified – see [Verification](#verification)). **Not deployed.** No public URL exists yet; see [Deployment](#deployment).

## 1. Business problem

Day-ahead power is bought before the delivery day, on the information available at that moment. Judging a forecast with hindsight (e.g. today's newest forecast for a past period) overstates its quality. This tool reconstructs what the buyer could have known, then measures how far that forecast was from reality and in which direction (over- or under-estimating). It measures **forecast accuracy only** – it does not estimate procurement volumes or savings (no demand or price data is used).

## 2. Key features

- **Two forecast views**: *decision-time* (latest forecast published at or before the cutoff) and *latest available* (newest published, a hindsight view), clearly labelled.
- KPI cards: MAE, RMSE, mean bias, valid matched periods, data coverage – all computed by the backend.
- Forecast-vs-actual line chart, forecast-error chart with zero line (error = forecast − actual), daily MAE chart and table.
- Searchable, sortable, filterable, paginated half-hourly table; missing values shown as "–", never `0`.
- Date range / single-day filters constrained to January 2026; active cutoff always visible.
- Honest data-quality reporting (coverage, missing forecasts/actuals, dropped/duplicate rows) and a methodology section.
- Responsive layout, light/dark themes, loading / error / empty states, keyboard-accessible controls.

## 3. Architecture and data flow

```
Browser (React) ──fetch──▶ FastAPI ──▶ ForecastService ──▶ file cache (JSON)
                                │                │
                                │                └──(cache miss / expired)──▶ Elexon BMRS API
                                ├─ analytics/selection.py  forecast selection + matching (pure pandas)
                                └─ analytics/metrics.py    MAE / RMSE / bias / daily (pure pandas)
```

1. On startup the backend warms a dataset: the whole January window is fetched once (chunked in 7-day pieces, with retry/backoff) and cached on disk as JSON.
2. Requests never call Elexon directly; they run selection + metrics on the in-memory dataset. The cache TTL is `CACHE_TTL_HOURS` (default 24h).
3. If Elexon is unreachable, a stale cache is served and flagged (`data_source: "stale_cache"`); with no cache the API returns `503`.
4. The frontend only renders what the API returns. **No metric is computed in the frontend.**

## 4. Tech stack

React 18 · TypeScript · Vite · Tailwind CSS 3 · Recharts · Vitest + Testing Library | Python 3.12 · FastAPI · Pandas · Pydantic (+ pydantic-settings) · HTTPX · Pytest | Docker, Docker Compose, nginx (static frontend).

## 5. Folder structure

```
Backend/
  app/
    main.py                 app factory, CORS, error handler, startup warm-up
    config.py               settings from environment variables
    api/routes.py           /api/* endpoints + query validation
    analytics/              pure logic, no I/O
      timeutil.py           Europe/London handling, expected periods, cutoff calc
      selection.py          decision-time / latest forecast selection + matching
      metrics.py            accuracy metrics
    services/
      elexon_client.py      HTTP client (chunking, retries)
      normalisation.py      raw rows -> typed UTC frames + quality counts
      cache.py              atomic JSON file cache
      forecast_service.py   cache/live orchestration, builds records
      analysis_service.py   summary + daily payload
    models/schemas.py       Pydantic response models
  tests/                    pytest suite (synthetic fixtures only)
  Dockerfile  Procfile  requirements*.txt
Frontend/
  src/
    components/             Header, MetricCard, charts, tables, DateFilters, Methodology, …
    pages/Dashboard.tsx     orchestration (data fetching vs presentation)
    services/api.ts         single place for API URL + typed calls
    hooks/useApi.ts         fetch-with-cancellation hook
    utils/                  formatters, chart helpers
    types/index.ts          API types
  Dockerfile  vercel.json
docker-compose.yml  .env.example
```

## 6. Elexon data sources and January 2026 scope

No API key is needed. Endpoints and parameters were taken from Elexon's OpenAPI spec (`https://data.elexon.co.uk/swagger/v1/swagger.json`) and exercised against the live API.

| Dataset | Endpoint | Used parameters | Notes |
|---|---|---|---|
| FUELHH (actual) | `GET /bmrs/api/v1/datasets/FUELHH/stream` | `settlementDateFrom/To` (yyyy-MM-dd), `fuelType=WIND` | Half-hourly, average MW. 1,488 rows for January, no gaps or duplicates observed. |
| WINDFOR (forecast) | `GET /bmrs/api/v1/datasets/WINDFOR/stream` | `publishDateTimeFrom/To` | **Hourly** `startTime`; published 8×/day (02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC observed), horizon up to ~66 h. |

Both `stream` endpoints return a plain JSON array with no pagination envelope, so retrieval is date-range chunked. Forecasts are fetched for publish times from 5 days before 1 Jan to 2 days after 31 Jan, so that early targets have forecasts and later revisions are present (`FORECAST_LOOKBACK_DAYS`, `FORECAST_FORWARD_DAYS`).

### Important: forecast resolution mismatch

WINDFOR is **hourly** but the brief assumes 1,488 half-hourly periods. By default (`HOURLY_FORECAST_FILL=none`) matching is strict on `startTime`, so the 744 half-hours starting at `:30` have **no forecast** and are reported as missing: coverage tops out at **50%** and the UI says so. Setting `HOURLY_FORECAST_FILL=hold` reuses the hour's forecast for its `:30` half-hour (flagged `forecast_filled`, shown with `*`), giving 100% coverage but treating an hourly value as constant across the hour – an assumption, not an Elexon statement. Default is `none` because it never invents a pairing.

## 7. Forecast selection logic and cutoff assumption

For each delivery period (start time `T`, local delivery date `D` in `Europe/London`):

1. cutoff = `DECISION_CUTOFF_TIME` local time on `D − DECISION_CUTOFF_DAYS_AHEAD` days, converted to UTC (DST-aware);
2. eligible forecasts = those for `T` with `publishTime <= cutoff` (equal is allowed);
3. choose the eligible forecast with the latest `publishTime`; if there is none, the period has **no forecast** (a later forecast is never substituted);
4. match to the actual for the same `startTime`; error is calculated only if both exist.

*Latest available* mode skips step 2's filter and picks the newest `publishTime` in the retrieved data (this can be published after delivery began – `lead_time_hours` is negative then). Identical `(startTime, publishTime)` rows are de-duplicated, keeping the last in input order.

**Assumption (not an official market rule):** the default cutoff is **09:00 Europe/London on the day before delivery**. It approximates the GB day-ahead auction gate closures, which I recall as being in the 09:20–09:50 UK-time range – I did not verify the exact current times in this project, which is why the value is configurable. Change it with `DECISION_CUTOFF_TIME` / `DECISION_CUTOFF_DAYS_AHEAD`. The API and UI label it as an assumption.

## 8. Accuracy metrics

With F = forecast, A = actual, error `e = F − A` (MW), over N valid matched periods:

| Metric | Formula | Reading |
|---|---|---|
| MAE | mean(\|e\|) | average miss size; lower is better |
| RMSE | sqrt(mean(e²)) | weights large misses more; ≥ MAE |
| Mean bias | mean(e) | **positive = overestimation**, negative = underestimation |
| MAPE (optional) | mean(\|e\|/A)·100 | only where `A ≥ MAPE_MIN_ACTUAL_MW` (100); never the sole metric |

Also returned: valid/expected counts, missing forecast/actual counts, coverage % (valid ÷ expected), over/under/exact counts, max absolute error (with time), and per-local-day MAE/RMSE/bias/coverage. Days with 0 valid periods are `no_data` (metrics `null`); fewer than `MIN_VALID_PERIODS_PER_DAY` (12) are `low_sample`.

### Observed results (default config, live data retrieved during development)

| View | N valid / 1,488 | MAE | RMSE | Bias |
|---|---|---|---|---|
| Decision-time (09:00 D-1) | 744 | 2,127.5 MW | 2,606.1 MW | +1,851.5 MW |
| Latest available | 744 | 1,764.2 MW | 2,258.6 MW | +1,596.4 MW |

These match an independent recomputation in plain Python from the raw API responses. Mean actual wind output over the month was ~11,581 MW. The large positive bias (forecasts above outturn) is reported as found; I did not investigate its cause (e.g. differences in what the two datasets cover).

## 9. Data quality and missing data

- Missing forecast/actual → `null`, excluded from every metric, counted in coverage. Never zero-filled.
- Rows with unparsable timestamps, null/non-numeric or negative generation are dropped and counted; duplicates are counted (`/api/metadata` → `data_sources`).
- Timestamps are normalised to UTC; market dates/cutoffs use `Europe/London`. Expected periods per local day are 48 (46/50 on clock-change days).
- Elexon failures: retries with backoff on 429/5xx (honouring `Retry-After`); then stale cache, else `503` with a generic message (no upstream details leak).
- The `/api/metadata` response labels the data `live` (fetched this run), `cache` (read from disk, with its original fetch time) or `stale_cache`.

## 10. Prerequisites and local setup

Python 3.12+, Node 20+ (developed on Node 24; the Docker image uses Node 22), Docker (optional).

```bash
# Backend  (http://localhost:8000, docs at /docs)
cd Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload

# Frontend (http://localhost:3000)
cd Frontend
cp .env.example .env        # VITE_API_URL=http://localhost:8000
npm ci && npm run dev
```

The first backend start downloads ~2.4 MB from Elexon (a few seconds) and caches it in `Backend/.cache/` (git-ignored).

### API

| Route | Purpose |
|---|---|
| `GET /api/health` | liveness; never calls Elexon |
| `GET /api/metadata` | cutoff, timezone, window, sources, row counts, freshness (`data_source`, `data_fetched_at`, `data_is_stale`) |
| `GET /api/forecasts?start&end&mode` | one record per half-hour: delivery time, forecast, publish time, actual, error |
| `GET /api/analysis?start&end&mode` | summary metrics, coverage, daily breakdown |

`start`/`end` default to the full window; `mode` is `decision` (default) or `latest`. Invalid ranges (start > end, outside Jan 2026) → `422` with a message; Elexon unavailable and no cache → `503`.

## 11. Docker

```bash
cp .env.example .env          # optional; defaults work
docker compose up --build
# Dashboard http://localhost:3000   API http://localhost:8000/docs
```

`FRONTEND_PORT` / `BACKEND_PORT` change the host ports. If you change the frontend port, also set `CORS_ORIGINS` to the new origin. `VITE_API_URL` is baked in at build time and is called by the **browser**, so it must be reachable from your machine. The backend cache lives in the `elexon-cache` volume.

## 12. Environment variables

**Backend** (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | allowed frontend origins, comma-separated (GET only) |
| `DECISION_CUTOFF_TIME` | `09:00` | local cutoff time (assumption) |
| `DECISION_CUTOFF_DAYS_AHEAD` | `1` | days before delivery date |
| `MARKET_TIMEZONE` | `Europe/London` | market timezone |
| `ANALYSIS_START` / `ANALYSIS_END` | `2026-01-01` / `2026-01-31` | analysis window |
| `HOURLY_FORECAST_FILL` | `none` | `none` or `hold` (see §6) |
| `FORECAST_LOOKBACK_DAYS` / `FORECAST_FORWARD_DAYS` | `5` / `2` | extra publish-time window |
| `MAPE_MIN_ACTUAL_MW` | `100` | MAPE floor |
| `MIN_VALID_PERIODS_PER_DAY` | `12` | below this a day is `low_sample` |
| `CACHE_DIR` / `CACHE_TTL_HOURS` | `.cache` / `24` | file cache |
| `ELEXON_BASE_URL`, `ELEXON_TIMEOUT_SECONDS`, `ELEXON_MAX_RETRIES`, `ELEXON_CHUNK_DAYS` | see `config.py` | client tuning |
| `PORT` | `8000` | set by Heroku-style hosts |

**Frontend:** `VITE_API_URL` – backend base URL (build time).

No secrets are used or committed; `.env` files are git-ignored (only `.env.example` files are tracked).

## 13. Testing

```bash
cd Backend  && pytest -q          # 52 tests
cd Frontend && npm test           # 28 tests (Vitest)
cd Frontend && npm run build      # type-check + production build
```

Backend tests cover: latest-eligible selection, rejecting post-cutoff forecasts (incl. exactly-at-cutoff), matching by delivery time, hand-computed MAE/RMSE/bias, missing forecast/actual, duplicates, BST/GMT-aware cutoffs and 46/50-period days, invalid date ranges, Elexon errors/retries/chunking, cache hit/expiry/stale/corrupt, and empty datasets. All test data is **synthetic fixtures, not Elexon data**. Frontend tests cover formatters, chart helpers, `MetricCard`, `DateFilters`, table sort/filter, and Dashboard requests changing with filters.

## 14. Deployment

**Status: not deployed. No public URL.** I had no hosting-account access; the configuration below is prepared but untested on those platforms.

**Backend (Heroku or any Python host)**
- Root: `Backend/` (e.g. `git subtree push --prefix Backend heroku main`) or deploy the `Backend/Dockerfile`.
- Build: `pip install -r requirements.txt` (Python from `.python-version`). Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (see `Procfile`). Health check: `GET /api/health`.
- Set `CORS_ORIGINS` to the exact deployed frontend origin, e.g. `https://your-app.vercel.app`.
- **Storage limitation:** Heroku's filesystem is ephemeral – the cache is lost on dyno restart (~daily), so the backend re-downloads from Elexon (a few seconds) after each restart. Cache write failures are non-fatal.

**Frontend (Vercel)**
- Root directory `Frontend/`; `vercel.json` sets build `npm run build`, output `dist`.
- Set env var `VITE_API_URL` to the public backend URL **before building** (it is compiled into the bundle).

Remaining manual steps: create both projects, set the two variables above, deploy, then confirm `/api/health` and load the dashboard.

## 15. Known limitations and future work

- WINDFOR is hourly; default coverage is capped at 50% (see §6). The `hold` option is an assumption.
- The 09:00 D-1 cutoff is a pilot assumption; the real gate depends on the market/auction used.
- The window is fixed by config (January 2026); there is no UI for other months.
- The cache is a single JSON file with a fixed TTL; no revision tracking. Historical FUELHH values could be revised by Elexon after retrieval.
- Single-process in-memory dataset (fine for this scope; a shared cache would be needed for multi-instance scale-out).
- The large positive bias was not root-caused. A natural next step is checking the scope of WINDFOR vs FUELHH wind.
- Possible additions: per-lead-time accuracy, CSV export, frontend code-splitting (bundle ≈ 560 kB), end-to-end browser tests.

## 16. AI-tool usage disclosure

This project was implemented with AI assistance: **Claude Code (Anthropic's CLI agent; model Claude Sonnet 5.5)** wrote the application code, tests, Docker/deployment configuration and this README from the assignment brief, and ran the tests, builds and API checks described above. It was not hand-written, and the code should be reviewed accordingly.

## Verification

Done in the development environment (Linux, Python 3.12.3, Node 24, Docker 29):

- Live Elexon API checked against its OpenAPI spec; January 2026 retrieved (1,488 actual rows; 22,192 forecast rows).
- Metrics independently recomputed in plain Python from raw responses: identical.
- Backend 52/52 and frontend 28/28 tests passing; production build succeeds.
- `docker compose up --build`: both containers started, backend reported healthy, live fetch into an empty volume, API returned the same metrics, and the frontend served from nginx rendered them in headless Chrome.
- Screenshots checked in light and dark themes at desktop width, and the top of the page (header, filters, KPIs, first chart) at 390 px mobile width. The lower sections (tables, methodology) were not visually checked on mobile.
