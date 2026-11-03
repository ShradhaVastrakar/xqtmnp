import { useId } from "react";

interface Props {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  detail?: string;
  tone?: "default" | "over" | "under";
  loading?: boolean;
}

export function MetricCard({ label, value, unit, hint, detail, tone = "default", loading }: Props) {
  const tipId = useId();
  const toneClass = tone === "over" ? "text-[var(--err-over)]" : tone === "under" ? "text-[var(--err-under)]" : "text-ink";
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-sm" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</h3>
        <span className="group relative">
          <button
            type="button"
            aria-label={`About ${label}`}
            aria-describedby={tipId}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-ink-3 hover:text-ink"
          >
            i
          </button>
          <span
            id={tipId}
            role="tooltip"
            className="pointer-events-none invisible absolute right-0 top-6 z-20 w-60 rounded-lg border border-line bg-surface p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-ink-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
          >
            {hint}
          </span>
        </span>
      </div>
      <p className={`tabular mt-2 text-2xl font-semibold sm:text-3xl ${toneClass} ${loading ? "opacity-40" : ""}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-ink-3">{unit}</span>}
      </p>
      {detail && <p className="mt-1 text-xs text-ink-3">{detail}</p>}
    </article>
  );
}
