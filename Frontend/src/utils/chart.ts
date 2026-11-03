import type { ForecastRecord } from "../types";
import { MARKET_TZ } from "./formatters";

export interface ChartPoint {
  ts: number;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  publish: string | null;
  filled: boolean;
}

export function toChartPoints(records: ForecastRecord[]): ChartPoint[] {
  return records.map((r) => ({
    ts: new Date(r.delivery_time).getTime(),
    forecast: r.forecast_mw,
    actual: r.actual_mw,
    error: r.error_mw,
    publish: r.forecast_publish_time,
    filled: r.forecast_filled,
  }));
}

function localParts(ts: number, tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(new Date(ts));
  const get = (t: string) => p.find((x) => x.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

/**
 * Readable x-axis ticks taken from the points themselves (so they work for numeric and
 * category axes): every 3 hours for a single day, otherwise the first point of each
 * market-local day, thinned to at most ``maxTicks``.
 */
export function buildTicks(points: ChartPoint[], tz = MARKET_TZ, maxTicks = 8): number[] {
  if (points.length === 0) return [];
  const parts = points.map((p) => ({ ts: p.ts, ...localParts(p.ts, tz) }));
  const days = new Set(parts.map((p) => p.date));
  if (days.size === 1) return parts.filter((p) => p.minute === 0 && p.hour % 3 === 0).map((p) => p.ts);
  const seen = new Set<string>();
  const firsts: number[] = [];
  for (const p of parts) {
    if (!seen.has(p.date)) {
      seen.add(p.date);
      firsts.push(p.ts);
    }
  }
  const step = Math.max(1, Math.ceil(firsts.length / maxTicks));
  return firsts.filter((_, i) => i % step === 0);
}

export function isSingleDay(points: ChartPoint[], tz = MARKET_TZ): boolean {
  return new Set(points.map((p) => localParts(p.ts, tz).date)).size <= 1;
}

/**
 * Values used only to DRAW the forecast line across the :30 half-hours, where the hourly
 * WINDFOR dataset has no value. Gaps over ``maxGapMs`` stay broken. Tooltips and tables use
 * the real ``forecast`` field, never this interpolation.
 */
export function withForecastLine(points: ChartPoint[], maxGapMs = 2 * 3600_000): (ChartPoint & { forecastLine: number | null })[] {
  const idx = points.map((p, i) => (p.forecast != null ? i : -1)).filter((i) => i >= 0);
  return points.map((p, i) => {
    if (p.forecast != null) return { ...p, forecastLine: p.forecast };
    const next = idx.find((j) => j > i);
    const prev = [...idx].reverse().find((j) => j < i);
    if (prev == null || next == null) return { ...p, forecastLine: null };
    const a = points[prev], b = points[next];
    if (b.ts - a.ts > maxGapMs) return { ...p, forecastLine: null };
    const t = (p.ts - a.ts) / (b.ts - a.ts);
    return { ...p, forecastLine: a.forecast! + t * (b.forecast! - a.forecast!) };
  });
}
