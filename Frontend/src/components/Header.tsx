import type { DataSource, Metadata } from "../types";
import { formatDateTimeYear, formatRange } from "../utils/formatters";

const SOURCE_LABEL: Record<DataSource, string> = {
  live: "Freshly fetched from Elexon",
  cache: "Served from local cache",
  stale_cache: "Stale cache (Elexon unreachable)",
};

function Chip({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${warn ? "border-amber-300/60 bg-amber-300/10" : "border-white/15 bg-white/5"}`}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-sky-200/80">{label}</dt>
      <dd className="mt-0.5 text-sm text-white">{children}</dd>
    </div>
  );
}

export function Header({ meta, start, end }: { meta: Metadata | null; start: string; end: string }) {
  return (
    <header className="bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex items-center gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="7" fill="rgba(255,255,255,0.1)" />
            <path d="M16 16V6M16 16l8.7 5M16 16l-8.7 5" stroke="#2dd4bf" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <circle cx="16" cy="16" r="2.4" fill="#fff" />
          </svg>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Wind Forecast Intelligence</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-sky-100/90">
          Compares the wind generation forecast that was available at day-ahead decision time with what was actually generated,
          so procurement teams can see how far forecasts over- or under-shoot.
        </p>
        <dl className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Chip label="Analysis period">{formatRange(start, end)}</Chip>
          <Chip label="Data source">
            Elexon BMRS <span className="text-sky-200/80">· FUELHH &amp; WINDFOR</span>
          </Chip>
          <Chip label="Data freshness" warn={meta?.data_is_stale}>
            {meta ? (
              <>
                <span>{formatDateTimeYear(meta.data_fetched_at, meta.timezone)}</span>
                <span className="block text-xs text-sky-200/80">{SOURCE_LABEL[meta.data_source]}</span>
              </>
            ) : (
              "Loading…"
            )}
          </Chip>
          <Chip label="Decision cutoff">
            {meta ? (
              <>
                {meta.decision_cutoff_time} {meta.timezone}, {meta.decision_cutoff_days_ahead === 1 ? "day before" : `${meta.decision_cutoff_days_ahead} days before`} delivery
                {meta.cutoff_is_assumption && <span className="block text-xs text-sky-200/80">Pilot assumption – configurable</span>}
              </>
            ) : (
              "Loading…"
            )}
          </Chip>
        </dl>
      </div>
    </header>
  );
}
