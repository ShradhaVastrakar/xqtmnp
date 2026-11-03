import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailySummary } from "../types";
import { formatDay, formatDayShort, formatMw, formatPct, formatSignedMw } from "../utils/formatters";
import { EmptyState } from "./States";

const AXIS = { fill: "var(--ink-3)", fontSize: 11 };

export function DailyAccuracyChart({ daily }: { daily: DailySummary[] }) {
  if (!daily.some((d) => d.mae != null)) return <EmptyState title="No daily accuracy to show">No day in this range has matched forecast and actual values.</EmptyState>;
  return (
    <div>
    <div role="img" aria-label="Bar chart of daily mean absolute error in megawatts. A table with the same values follows." style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDayShort} tick={AXIS} stroke="var(--line)" tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={AXIS} stroke="var(--line)" tickLine={false} width={64} tickFormatter={(v: number) => v.toLocaleString("en-GB")}
            label={{ value: "Daily MAE (MW)", angle: -90, position: "insideLeft", offset: 4, style: { ...AXIS, textAnchor: "middle" } }} />
          <Tooltip
            cursor={{ fill: "var(--grid)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as DailySummary;
              return (
                <div className="rounded-lg border border-line bg-surface p-3 text-xs shadow-lg">
                  <p className="mb-1 font-semibold text-ink">{formatDay(d.date)}</p>
                  {d.mae == null ? <p className="text-ink-3">No valid matched periods</p> : (
                    <>
                      <p className="tabular text-ink-2">MAE: <strong>{formatMw(d.mae)} MW</strong></p>
                      <p className="tabular text-ink-2">Mean bias: <strong>{formatSignedMw(d.bias)} MW</strong></p>
                      <p className="tabular text-ink-3">{d.n_valid} valid periods · {formatPct(d.coverage_pct, 0)} coverage</p>
                      {d.status === "low_sample" && <p className="mt-1 text-amber-700 dark:text-amber-300">Low sample – interpret with care</p>}
                    </>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="mae" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {daily.map((d) => (
              <Cell key={d.date} fill="var(--series-forecast)" fillOpacity={d.status === "ok" ? 1 : 0.4} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <p className="mt-2 text-center text-xs text-ink-3">Faded bars have too few valid periods for a reliable daily figure; days with no valid data are left blank.</p>
    </div>
  );
}
