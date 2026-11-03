import type { ForecastMode } from "../types";
import { formatDay } from "../utils/formatters";

interface Props {
  min: string;
  max: string;
  start: string;
  end: string;
  mode: ForecastMode;
  cutoffLabel: string;
  onRange: (start: string, end: string) => void;
  onMode: (mode: ForecastMode) => void;
}

const MODES: { id: ForecastMode; label: string; help: string }[] = [
  { id: "decision", label: "Decision-time forecast", help: "Latest forecast published at or before the cutoff" },
  { id: "latest", label: "Latest available forecast", help: "Newest forecast in the retrieved data (hindsight view)" },
];

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function DateFilters({ min, max, start, end, mode, cutoffLabel, onRange, onMode }: Props) {
  const clamp = (d: string) => (d < min ? min : d > max ? max : d);
  const presets = [{ label: "Full month", s: min, e: max }];
  for (let s = min; s <= max; s = addDays(s, 7)) presets.push({ label: `${formatDay(s, false)}–${formatDay(clamp(addDays(s, 6)), false)}`, s, e: clamp(addDays(s, 6)) });
  const single = start === end;
  const input = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink";

  return (
    <section aria-label="Filters" className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
            Start date
            <input
              type="date" className={input} min={min} max={max} value={start}
              onChange={(e) => e.target.value && onRange(e.target.value, e.target.value > end ? e.target.value : end)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
            End date
            <input
              type="date" className={input} min={min} max={max} value={end}
              onChange={(e) => e.target.value && onRange(e.target.value < start ? e.target.value : start, e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
            Single day
            <input
              type="date" aria-label="Single day" className={input} min={min} max={max} value={single ? start : ""}
              onChange={(e) => e.target.value && onRange(e.target.value, e.target.value)}
            />
          </label>
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-medium text-ink-3">Forecast view</legend>
          <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-line" role="radiogroup">
            {MODES.map((m) => (
              <label
                key={m.id} title={m.help}
                className={`cursor-pointer px-3 py-1.5 text-sm ${mode === m.id ? "bg-navy-800 text-white" : "bg-surface text-ink-2 hover:bg-page"} focus-within:outline focus-within:outline-2 focus-within:outline-brand`}
              >
                <input type="radio" name="forecast-mode" className="sr-only" checked={mode === m.id} onChange={() => onMode(m.id)} />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Quick ranges">
        <span className="text-xs font-medium text-ink-3">Quick range:</span>
        {presets.map((p) => {
          const active = p.s === start && p.e === end;
          return (
            <button
              key={p.label} type="button" onClick={() => onRange(p.s, p.e)} aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs ${active ? "border-brand bg-brand/10 font-semibold text-brand" : "border-line text-ink-2 hover:bg-page"}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 rounded-md bg-teal-soft px-3 py-2 text-xs text-ink-2">
        <strong className="font-semibold text-teal">Active cutoff:</strong> {cutoffLabel}.{" "}
        {mode === "decision"
          ? "Only forecasts published at or before the cutoff are used."
          : "Showing the most recently published forecast regardless of the cutoff – not what was known when buying."}
      </p>
    </section>
  );
}
