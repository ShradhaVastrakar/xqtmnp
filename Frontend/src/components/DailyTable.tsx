import type { DailySummary } from "../types";
import { formatDay, formatInt, formatMw, formatPct, formatSignedMw } from "../utils/formatters";

const STATUS = {
  ok: { label: "OK", cls: "bg-teal-soft text-teal" },
  low_sample: { label: "Low sample", cls: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200" },
  no_data: { label: "No data", cls: "bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-200" },
} as const;

export function DailyTable({ daily, minValid }: { daily: DailySummary[]; minValid: number }) {
  return (
    <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Daily forecast accuracy. Low sample means fewer than {minValid} valid periods.</caption>
        <thead className="sticky top-0 bg-page text-xs uppercase tracking-wide text-ink-3">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Date</th>
            <th scope="col" className="px-3 py-2 text-right">MAE (MW)</th>
            <th scope="col" className="px-3 py-2 text-right">RMSE (MW)</th>
            <th scope="col" className="px-3 py-2 text-right">Mean bias (MW)</th>
            <th scope="col" className="px-3 py-2 text-right">Valid periods</th>
            <th scope="col" className="px-3 py-2 text-right">Coverage</th>
            <th scope="col" className="px-3 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-line">
          {daily.map((d) => (
            <tr key={d.date} className="hover:bg-page">
              <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium">{formatDay(d.date)}</th>
              <td className="px-3 py-1.5 text-right">{formatMw(d.mae)}</td>
              <td className="px-3 py-1.5 text-right">{formatMw(d.rmse)}</td>
              <td className="px-3 py-1.5 text-right">{formatSignedMw(d.bias)}</td>
              <td className="px-3 py-1.5 text-right">{formatInt(d.n_valid)} / {formatInt(d.n_expected)}</td>
              <td className="px-3 py-1.5 text-right">{formatPct(d.coverage_pct)}</td>
              <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
