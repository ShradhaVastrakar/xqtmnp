import { buildTicks, withForecastLine, type ChartPoint } from "./chart";

const H = 3600_000;
const T0 = Date.UTC(2026, 0, 5);
const pt = (ts: number, forecast: number | null): ChartPoint => ({ ts, forecast, actual: 1, error: null, publish: null, filled: false });

describe("withForecastLine", () => {
  it("interpolates only across short gaps and never changes real values", () => {
    const pts = withForecastLine([pt(T0, 100), pt(T0 + 0.5 * H, null), pt(T0 + H, 200)]);
    expect(pts.map((p) => p.forecastLine)).toEqual([100, 150, 200]);
    expect(pts[1].forecast).toBeNull();
  });

  it("leaves long gaps broken (no invented line across missing data)", () => {
    const pts = withForecastLine([pt(T0, 100), pt(T0 + 3 * H, null), pt(T0 + 6 * H, 200)]);
    expect(pts[1].forecastLine).toBeNull();
  });
});

describe("buildTicks", () => {
  it("uses 3-hourly ticks for a single day", () => {
    const pts = Array.from({ length: 48 }, (_, i) => pt(T0 + i * 0.5 * H, 1));
    const ticks = buildTicks(pts, "Europe/London");
    expect(ticks).toHaveLength(8);
    expect(ticks[0]).toBe(T0);
  });

  it("uses at most maxTicks day-starts for multi-day ranges", () => {
    const pts = Array.from({ length: 31 * 48 }, (_, i) => pt(T0 + i * 0.5 * H, 1));
    const ticks = buildTicks(pts, "Europe/London", 8);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks[0]).toBe(T0);
  });

  it("returns nothing for no data", () => {
    expect(buildTicks([])).toEqual([]);
  });
});
