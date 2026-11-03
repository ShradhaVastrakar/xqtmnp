export type ForecastMode = "decision" | "latest";
export type DataSource = "live" | "cache" | "stale_cache";

export interface ForecastRecord {
  delivery_time: string;
  delivery_date: string;
  forecast_mw: number | null;
  forecast_publish_time: string | null;
  cutoff_time: string;
  lead_time_hours: number | null;
  forecast_filled: boolean;
  actual_mw: number | null;
  error_mw: number | null;
}

export interface ForecastsResponse {
  mode: ForecastMode;
  start: string;
  end: string;
  count: number;
  records: ForecastRecord[];
}

export interface Summary {
  n_expected: number;
  n_valid: number;
  n_missing_forecast: number;
  n_missing_actual: number;
  coverage_pct: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  mape_pct: number | null;
  mape_n: number;
  n_overestimated: number;
  n_underestimated: number;
  n_exact: number;
  max_abs_error: number | null;
  max_abs_error_time: string | null;
}

export interface DailySummary extends Summary {
  date: string;
  status: "ok" | "low_sample" | "no_data";
}

export interface AnalysisResponse {
  mode: ForecastMode;
  start: string;
  end: string;
  summary: Summary;
  daily: DailySummary[];
  data_source: DataSource;
  data_fetched_at: string;
}

export interface DataSourceInfo {
  name: string;
  dataset: string;
  description: string;
  documentation_url: string;
  rows_retrieved: number;
  invalid_rows_dropped: number;
  duplicates_dropped: number;
}

export interface Metadata {
  timezone: string;
  analysis_start: string;
  analysis_end: string;
  expected_periods: number;
  decision_cutoff_time: string;
  decision_cutoff_days_ahead: number;
  decision_cutoff_description: string;
  cutoff_is_assumption: boolean;
  hourly_forecast_fill: "none" | "hold";
  forecast_native_resolution_minutes: number;
  min_valid_periods_per_day: number;
  mape_min_actual_mw: number;
  data_sources: DataSourceInfo[];
  data_fetched_at: string;
  data_source: DataSource;
  data_is_stale: boolean;
}
