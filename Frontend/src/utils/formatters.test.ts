import { errorWord, formatDay, formatMw, formatPct, formatRange, formatSignedMw, formatDateTime, DASH } from "./formatters";

describe("formatters", () => {
  it("formats MW with thousands separators and a dash for missing values", () => {
    expect(formatMw(18781)).toBe("18,781");
    expect(formatMw(1851.528, 1)).toBe("1,851.5");
    expect(formatMw(null)).toBe(DASH);
    expect(formatMw(undefined)).toBe(DASH);
  });

  it("signs errors, using a true minus sign", () => {
    expect(formatSignedMw(1852)).toBe("+1,852");
    expect(formatSignedMw(-300)).toBe("−300");
    expect(formatSignedMw(0)).toBe("0");
    expect(formatSignedMw(null)).toBe(DASH);
  });

  it("formats percentages", () => {
    expect(formatPct(50)).toBe("50.0%");
    expect(formatPct(null)).toBe(DASH);
  });

  it("formats calendar days without timezone drift", () => {
    expect(formatDay("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDay("2026-01-31", false)).toBe("31 Jan");
    expect(formatRange("2026-01-05", "2026-01-05")).toBe("5 Jan 2026");
    expect(formatRange("2026-01-01", "2026-01-31")).toBe("1 Jan – 31 Jan 2026");
  });

  it("renders instants in Europe/London, including daylight saving", () => {
    expect(formatDateTime("2026-01-01T12:00:00Z", "Europe/London")).toBe("01 Jan 12:00");
    expect(formatDateTime("2026-07-01T12:00:00Z", "Europe/London")).toBe("01 Jul 13:00");
  });

  it("names the error direction", () => {
    expect(errorWord(5)).toBe("over");
    expect(errorWord(-5)).toBe("under");
    expect(errorWord(0)).toBe("");
  });
});
