import type { ReactNode } from "react";

export function ChartCard({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
