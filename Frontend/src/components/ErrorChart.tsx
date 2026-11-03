import { useMemo } from "react";
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastRecord } from "../types";
import { buildTicks, isSingleDay, toChartPoints } from "../utils/chart";
import { formatDateTime, formatDateTimeYear, formatMw, formatSignedMw, formatTime } from "../utils/formatters";
import { EmptyState } from "./States";

const AXIS = { fill: "var(--ink-3)", fontSize: 11 };

export function ErrorChart({ records, tz }: { records: ForecastRecord[]; tz: string }) {
  const points = useMemo(() => toChartPoints(records).filter((p) => p.error != null), [records]);
  const ticks = useMemo(() => buildTicks(points, tz), [points, tz]);
  const single = useMemo(() => isSingleDay(points, tz), [points, tz]);

  if (points.length === 0) return <EmptyState title="No matched forecast/actual pairs">Forecast error needs both a forecast and an actual value.</EmptyState>;
  return (
    <div>
    <div role="img" aria-label="Bar chart of forecast error (forecast minus actual) in megawatts" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={0}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="ts" ticks={ticks} interval={0}
            tickFormatter={(v: number) => (single ? formatTime(new Date(v).toISOString(), tz) : formatDateTime(new Date(v).toISOString(), tz).slice(0, 6))}
            tick={AXIS} stroke="var(--line)" tickLine={false}
          />
          <YAxis tick={AXIS} stroke="var(--line)" tickLine={false} width={64} tickFormatter={(v: number) => v.toLocaleString("en-GB")}
            label={{ value: "Error (MW)", angle: -90, position: "insideLeft", offset: 4, style: { ...AXIS, textAnchor: "middle" } }} />
          <Tooltip
            cursor={{ fill: "var(--grid)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof points)[number];
              return (
                <div className="rounded-lg border border-line bg-surface p-3 text-xs shadow-lg">
                  <p className="mb-1 font-semibold text-ink">{formatDateTimeYear(new Date(p.ts).toISOString(), tz)}</p>
                  <p className="tabular text-ink-2">Error: <strong>{formatSignedMw(p.error)} MW</strong> ({(p.error ?? 0) > 0 ? "overestimate" : (p.error ?? 0) < 0 ? "underestimate" : "exact"})</p>
                  <p className="tabular text-ink-3">Forecast {formatMw(p.forecast)} − Actual {formatMw(p.actual)}</p>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="var(--ink-2)" strokeWidth={1.5} />
          <Bar dataKey="error" isAnimationActive={false} maxBarSize={14}>
            {points.map((p) => (
              <Cell key={p.ts} fill={(p.error ?? 0) >= 0 ? "var(--err-over)" : "var(--err-under)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-ink-2">
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--err-over)" }} />Above zero: forecast over-estimated</span>
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--err-under)" }} />Below zero: forecast under-estimated</span>
      </div>
    </div>
  );
}
