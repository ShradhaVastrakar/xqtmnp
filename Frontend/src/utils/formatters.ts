export const MARKET_TZ = "Europe/London";

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions, tz: string): Intl.DateTimeFormat {
  const key = JSON.stringify([opts, tz]);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz });
    cache.set(key, f);
  }
  return f;
}

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const DASH = "–";

export function formatMw(v: number | null | undefined, digits: 0 | 1 = 0): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return (digits === 1 ? nf1 : nf0).format(v);
}

/** Signed MW, e.g. "+1,852" / "−300" (uses a true minus sign). */
export function formatSignedMw(v: number | null | undefined, digits: 0 | 1 = 0): string {
  if (v == null || Number.isNaN(v)) return DASH;
  const s = (digits === 1 ? nf1 : nf0).format(Math.abs(v));
  if (v > 0) return `+${s}`;
  if (v < 0) return `−${s}`;
  return s;
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return `${v.toFixed(digits)}%`;
}

export function formatInt(v: number | null | undefined): string {
  return v == null ? DASH : nf0.format(v);
}

export function formatDateTime(iso: string | null | undefined, tz = MARKET_TZ): string {
  if (!iso) return DASH;
  return fmt({ day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }, tz)
    .format(new Date(iso))
    .replace(",", "");
}

export function formatDateTimeYear(iso: string | null | undefined, tz = MARKET_TZ): string {
  if (!iso) return DASH;
  return fmt(
    { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" },
    tz,
  )
    .format(new Date(iso))
    .replace(",", "");
}

export function formatTime(iso: string, tz = MARKET_TZ): string {
  return fmt({ hour: "2-digit", minute: "2-digit", hour12: false }, tz).format(new Date(iso));
}

/** "2026-01-05" -> "5 Jan 2026" (date-only strings are calendar dates, not instants). */
export function formatDay(day: string, withYear = true): string {
  const [y, m, d] = day.split("-").map(Number);
  return fmt({ day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }, "UTC").format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDayShort(day: string): string {
  return formatDay(day, false);
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatDay(start) : `${formatDay(start, false)} – ${formatDay(end)}`;
}

export function errorWord(v: number | null | undefined): string {
  if (v == null || v === 0) return "";
  return v > 0 ? "over" : "under";
}
