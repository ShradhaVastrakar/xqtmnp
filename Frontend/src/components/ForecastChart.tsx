import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ForecastMode, ForecastRecord } from "../types";
import { buildTicks, isSingleDay, toChartPoints, withForecastLine } from "../utils/chart";
import { formatDateTime, formatDateTimeYear, formatMw, formatTime } from "../utils/formatters";
import { EmptyState } from "./States";

const AXIS = { fill: "var(--ink-3)", fontSize: 11 };

interface TipProps {
  active?: boolean;
  payload?: { payload: ReturnType<typeof withForecastLine>[number] }[];
  tz: string;
}

function Tip({ active, payload, tz }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface p-3 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink">{formatDateTimeYear(new Date(p.ts).toISOString(), tz)}</p>
      <p className="tabular text-ink-2"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: "var(--series-forecast)" }} />Forecast: <strong>{p.forecast == null ? "no forecast" : `${formatMw(p.forecast)} MW`}</strong></p>
      <p className="tabular text-ink-2"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: "var(--series-actual)" }} />Actual: <strong>{p.actual == null ? "no data" : `${formatMw(p.actual)} MW`}</strong></p>
      {p.publish && <p className="mt-1 text-ink-3">Forecast published {formatDateTime(p.publish, tz)}{p.filled ? " (hourly value held)" : ""}</p>}
    </div>
  );
}

export function ForecastChart({ records, mode, tz }: { records: ForecastRecord[]; mode: ForecastMode; tz: string }) {
  const points = useMemo(() => withForecastLine(toChartPoints(records)), [records]);
  const ticks = useMemo(() => buildTicks(points, tz), [points, tz]);
  const single = useMemo(() => isSingleDay(points, tz), [points, tz]);

  if (!points.some((p) => p.forecast != null || p.actual != null)) {
    return <EmptyState title="No generation data for this selection">Try a different date range.</EmptyState>;
  }
  const forecastLabel = mode === "decision" ? "Forecast (decision-time)" : "Forecast (latest available)";
  return (
    <div role="img" aria-label={`Line chart of ${forecastLabel} and actual wind generation in megawatts`} style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="ts" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks}
            tickFormatter={(v: number) => (single ? formatTime(new Date(v).toISOString(), tz) : formatDateTime(new Date(v).toISOString(), tz).slice(0, 6))}
            tick={AXIS} stroke="var(--line)" tickLine={false}
          />
          <YAxis tick={AXIS} stroke="var(--line)" tickLine={false} width={64} tickFormatter={(v: number) => v.toLocaleString("en-GB")}
            label={{ value: "Generation (MW)", angle: -90, position: "insideLeft", offset: 4, style: { ...AXIS, textAnchor: "middle" } }} />
          <Tooltip content={<Tip tz={tz} />} cursor={{ stroke: "var(--ink-3)", strokeDasharray: "3 3" }} />
          <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          <Line name={forecastLabel} dataKey="forecastLine" stroke="var(--series-forecast)" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
          <Line name="Actual" dataKey="actual" stroke="var(--series-actual)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
