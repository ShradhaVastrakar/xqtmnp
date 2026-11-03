import { useMemo, useState } from "react";
import type { ForecastRecord } from "../types";
import { DASH, formatDateTime, formatMw, formatSignedMw } from "../utils/formatters";
import { EmptyState } from "./States";

type SortKey = "delivery_time" | "forecast_mw" | "forecast_publish_time" | "actual_mw" | "error_mw";
type Filter = "all" | "matched" | "missing" | "over" | "under";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "delivery_time", label: "Delivery time" },
  { key: "forecast_mw", label: "Forecast (MW)", numeric: true },
  { key: "forecast_publish_time", label: "Forecast published" },
  { key: "actual_mw", label: "Actual (MW)", numeric: true },
  { key: "error_mw", label: "Error (MW)", numeric: true },
];

const PAGE_SIZE = 48;

/** Nulls always sort last regardless of direction. */
export function sortRecords(rows: ForecastRecord[], key: SortKey, dir: "asc" | "desc"): ForecastRecord[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av < bv ? -sign : av > bv ? sign : 0;
  });
}

export function filterRecords(rows: ForecastRecord[], filter: Filter, query: string, tz: string): ForecastRecord[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter === "matched" && r.error_mw == null) return false;
    if (filter === "missing" && r.error_mw != null) return false;
    if (filter === "over" && !((r.error_mw ?? 0) > 0)) return false;
    if (filter === "under" && !((r.error_mw ?? 0) < 0)) return false;
    if (!q) return true;
    const hay = [formatDateTime(r.delivery_time, tz), r.delivery_date, r.forecast_mw, r.actual_mw, r.error_mw].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

export function ForecastTable({ records, tz }: { records: ForecastRecord[]; tz: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "delivery_time", dir: "asc" });
  const [page, setPage] = useState(0);

  const rows = useMemo(() => sortRecords(filterRecords(records, filter, query, tz), sort.key, sort.dir), [records, filter, query, tz, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = rows.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);
  const input = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink";

  const toggle = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(0);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
          Search
          <input type="search" className={`${input} w-56`} placeholder="e.g. 05 Jan 12:00 or 18781" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
          Show
          <select className={input} value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setPage(0); }}>
            <option value="all">All periods</option>
            <option value="matched">Matched (forecast &amp; actual)</option>
            <option value="missing">Missing forecast or actual</option>
            <option value="over">Overestimated</option>
            <option value="under">Underestimated</option>
          </select>
        </label>
        <p className="tabular ml-auto text-xs text-ink-3" aria-live="polite">{rows.length.toLocaleString("en-GB")} of {records.length.toLocaleString("en-GB")} periods</p>
      </div>

      {slice.length === 0 ? (
        <EmptyState title="No periods match these filters" />
      ) : (
        <div className="overflow-auto rounded-lg border border-line">
          <table className="w-full min-w-[680px] text-sm">
            <caption className="sr-only">Half-hourly forecast versus actual wind generation. Error is forecast minus actual.</caption>
            <thead className="bg-page text-xs uppercase tracking-wide text-ink-3">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className={`px-3 py-2 ${c.numeric ? "text-right" : "text-left"}`} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink">
                      {c.label}
                      <span aria-hidden className="text-[10px]">{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular divide-y divide-line">
              {slice.map((r) => (
                <tr key={r.delivery_time} className="hover:bg-page">
                  <td className="whitespace-nowrap px-3 py-1.5">{formatDateTime(r.delivery_time, tz)}</td>
                  <td className="px-3 py-1.5 text-right">{r.forecast_mw == null ? <span title="No forecast for this period">{DASH}</span> : formatMw(r.forecast_mw)}{r.forecast_filled && <span title="Hourly forecast held onto this half-hour" className="ml-1 text-xs text-ink-3">*</span>}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{formatDateTime(r.forecast_publish_time, tz)}</td>
                  <td className="px-3 py-1.5 text-right">{r.actual_mw == null ? <span title="No actual for this period">{DASH}</span> : formatMw(r.actual_mw)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${(r.error_mw ?? 0) > 0 ? "text-[var(--err-over)]" : (r.error_mw ?? 0) < 0 ? "text-[var(--err-under)]" : ""}`}>{formatSignedMw(r.error_mw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-sm">
        <button type="button" className="rounded-md border border-line px-3 py-1 disabled:opacity-40" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
        <span className="tabular text-xs text-ink-3">Page {cur + 1} of {pages}</span>
        <button type="button" className="rounded-md border border-line px-3 py-1 disabled:opacity-40" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
      </div>
    </div>
  );
}
