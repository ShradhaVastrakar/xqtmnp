const ITEMS = [
  ["Why half-hourly periods?", "GB electricity is settled in 30-minute periods, and Elexon reports actual wind outturn on that grid. Each period is compared separately so short, costly misses are not averaged away."],
  ["Why publication time matters", "A buyer can only act on what was published before the day-ahead cutoff. Using today’s newest forecast for a past period would flatter the forecast, so the decision-time view picks the latest forecast published at or before the cutoff."],
  ["How error is calculated", "Error = forecast − actual, in MW. Positive means the forecast over-estimated generation; negative means it under-estimated."],
  ["MAE, RMSE and bias", "MAE is the average size of the miss. RMSE is similar but penalises large misses more. Mean bias is the average signed error: persistently positive or negative values show a systematic lean, while a near-zero bias can still hide large errors that cancel out."],
  ["Missing observations", "A period with no forecast or no actual is left out of every accuracy metric – never counted as zero – and is reported in the coverage figures instead."],
  ["Scope", "This dashboard measures forecast accuracy only. It does not estimate procurement volumes or financial savings, which would need demand and price data that are outside its scope."],
] as const;

export function Methodology() {
  return (
    <section aria-label="Methodology" className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold">Methodology</h2>
      <dl className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
        {ITEMS.map(([t, d]) => (
          <div key={t}>
            <dt className="text-sm font-semibold text-ink">{t}</dt>
            <dd className="mt-0.5 text-sm leading-relaxed text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
