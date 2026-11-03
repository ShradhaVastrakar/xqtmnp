import { useState } from "react";
import { ChartCard } from "../components/ChartCard";
import { DailyAccuracyChart } from "../components/DailyAccuracyChart";
import { DailyTable } from "../components/DailyTable";
import { DateFilters } from "../components/DateFilters";
import { ErrorChart } from "../components/ErrorChart";
import { ForecastChart } from "../components/ForecastChart";
import { ForecastTable } from "../components/ForecastTable";
import { Header } from "../components/Header";
import { MetricCard } from "../components/MetricCard";
import { Methodology } from "../components/Methodology";
import { ErrorBox, Loading } from "../components/States";
import { useApi } from "../hooks/useApi";
import { api } from "../services/api";
import type { ForecastMode } from "../types";
import { formatDateTime, formatInt, formatMw, formatPct, formatSignedMw } from "../utils/formatters";

export default function Dashboard() {
  const meta = useApi((s) => api.metadata(s), []);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [mode, setMode] = useState<ForecastMode>("decision");

  const m = meta.data;
  const start = range?.start ?? m?.analysis_start ?? "";
  const end = range?.end ?? m?.analysis_end ?? "";
  const ready = Boolean(m && start && end);

  const analysis = useApi((s) => (ready ? api.analysis(start, end, mode, s) : Promise.resolve(null)), [ready, start, end, mode]);
  const forecasts = useApi((s) => (ready ? api.forecasts(start, end, mode, s) : Promise.resolve(null)), [ready, start, end, mode]);

  if (meta.error) {
    return (
      <div className="min-h-screen">
        <Header meta={null} start="2026-01-01" end="2026-01-31" />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><ErrorBox message={meta.error} onRetry={meta.reload} /></main>
      </div>
    );
  }

  const a = analysis.data;
  const s = a?.summary;
  const busy = analysis.loading;
  const cutoffLabel = m ? `${m.decision_cutoff_time} ${m.timezone}, ${m.decision_cutoff_days_ahead === 1 ? "the day before" : `${m.decision_cutoff_days_ahead} days before`} delivery` : "";

  return (
    <div className="min-h-screen pb-12">
      <Header meta={m} start={start || "2026-01-01"} end={end || "2026-01-31"} />
      <main className="mx-auto mt-6 flex max-w-7xl flex-col gap-6 px-4 sm:px-6">
        {!m ? (
          <Loading label="Loading data from Elexon… the first load can take a few seconds." height={320} />
        ) : (
          <>
            {m.data_is_stale && (
              <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                Elexon could not be reached, so a previously cached copy retrieved {formatDateTime(m.data_fetched_at, m.timezone)} is being shown.
              </div>
            )}
            {m.hourly_forecast_fill === "none" && (
              <div role="note" className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink-2">
                <strong className="text-ink">Resolution note:</strong> Elexon’s WINDFOR forecasts are published hourly, while actual outturn (FUELHH) is half-hourly. Half-hour periods starting at :30 therefore have no forecast and are reported as missing – so data coverage cannot exceed about 50%.
              </div>
            )}

            <DateFilters
              min={m.analysis_start} max={m.analysis_end} start={start} end={end} mode={mode} cutoffLabel={cutoffLabel}
              onRange={(st, en) => setRange({ start: st, end: en })} onMode={setMode}
            />

            {analysis.error && <ErrorBox message={analysis.error} onRetry={analysis.reload} />}

            <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard loading={busy} label="Mean absolute error" value={formatMw(s?.mae)} unit="MW"
                hint="Average size of the forecast miss, ignoring direction: mean of |forecast − actual|. Lower is better." />
              <MetricCard loading={busy} label="RMSE" value={formatMw(s?.rmse)} unit="MW"
                hint="Root mean squared error. Like MAE but squares errors first, so large misses count more. Always ≥ MAE." />
              <MetricCard loading={busy} label="Mean bias" value={formatSignedMw(s?.bias)} unit="MW"
                tone={s?.bias == null ? "default" : s.bias > 0 ? "over" : s.bias < 0 ? "under" : "default"}
                detail={s?.bias == null ? undefined : s.bias > 0 ? "Forecasts over-estimate on average" : s.bias < 0 ? "Forecasts under-estimate on average" : "No average lean"}
                hint="Average of (forecast − actual). Positive = systematic overestimation, negative = underestimation. Near zero can still hide large offsetting errors." />
              <MetricCard loading={busy} label="Valid matched periods" value={formatInt(s?.n_valid)}
                detail={s ? `of ${formatInt(s.n_expected)} expected half-hours` : undefined}
                hint="Half-hour periods that have both a forecast and an actual value. Only these feed the accuracy metrics." />
              <MetricCard loading={busy} label="Data coverage" value={formatPct(s?.coverage_pct)}
                detail={s ? `${formatInt(s.n_missing_forecast)} without forecast · ${formatInt(s.n_missing_actual)} without actual` : undefined}
                hint="Valid matched periods as a share of all half-hour periods in the selected range. Missing values are excluded, never treated as zero." />
            </section>

            {s && s.n_valid > 0 && (
              <p className="tabular -mt-3 text-xs text-ink-3">
                {formatInt(s.n_overestimated)} periods overestimated · {formatInt(s.n_underestimated)} underestimated · largest miss {formatMw(s.max_abs_error)} MW
                {s.max_abs_error_time ? ` (${formatDateTime(s.max_abs_error_time, m.timezone)})` : ""}
                {s.mape_pct != null ? ` · MAPE ${formatPct(s.mape_pct)} (actuals ≥ ${m.mape_min_actual_mw} MW)` : ""}
              </p>
            )}

            <ChartCard
              title="Forecast vs actual wind generation"
              subtitle={mode === "decision" ? `Forecast = latest published at or before the ${m.decision_cutoff_time} cutoff` : "Forecast = most recently published in the retrieved data (not the decision-time view)"}
            >
              {forecasts.loading ? <Loading height={340} /> : forecasts.error ? <ErrorBox message={forecasts.error} onRetry={forecasts.reload} /> : forecasts.data && <ForecastChart records={forecasts.data.records} mode={mode} tz={m.timezone} />}
              <p className="mt-2 text-xs text-ink-3">The dashed forecast line joins hourly forecast values across the half-hours in between; hover to see the real values.</p>
            </ChartCard>

            <ChartCard title="Forecast error" subtitle="Error = forecast − actual (MW). Above zero is overestimation; below zero is underestimation.">
              {forecasts.loading ? <Loading height={280} /> : forecasts.error ? null : forecasts.data && <ErrorChart records={forecasts.data.records} tz={m.timezone} />}
            </ChartCard>

            <ChartCard title="Daily accuracy" subtitle="Daily mean absolute error for the selected range">
              {analysis.loading ? <Loading height={260} /> : a && (
                <>
                  <DailyAccuracyChart daily={a.daily} />
                  <DailyTable daily={a.daily} minValid={m.min_valid_periods_per_day} />
                </>
              )}
            </ChartCard>

            <ChartCard title="Half-hourly data" subtitle="Every half-hour period in the selected range, including those with missing values">
              {forecasts.loading ? <Loading height={240} /> : forecasts.data && <ForecastTable records={forecasts.data.records} tz={m.timezone} />}
              {m.hourly_forecast_fill === "hold" && <p className="mt-2 text-xs text-ink-3">* Hourly forecast held onto the following half-hour.</p>}
            </ChartCard>

            <Methodology />

            <footer className="text-xs text-ink-3">
              Data: Elexon BMRS (FUELHH actual outturn, WINDFOR wind forecasts). {m.decision_cutoff_description}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
