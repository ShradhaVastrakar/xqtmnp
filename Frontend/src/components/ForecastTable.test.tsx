import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ForecastRecord } from "../types";
import { ForecastTable, filterRecords, sortRecords } from "./ForecastTable";

// Synthetic test fixtures – not real Elexon data.
const rec = (t: string, f: number | null, a: number | null): ForecastRecord => ({
  delivery_time: t, delivery_date: t.slice(0, 10), forecast_mw: f,
  forecast_publish_time: f == null ? null : "2026-01-01T07:30:00Z", cutoff_time: "2026-01-01T09:00:00Z",
  lead_time_hours: null, forecast_filled: false, actual_mw: a, error_mw: f != null && a != null ? f - a : null,
});
const ROWS = [
  rec("2026-01-02T00:00:00Z", 100, 80),   // +20 over
  rec("2026-01-02T00:30:00Z", null, 85),  // missing forecast
  rec("2026-01-02T01:00:00Z", 70, 90),    // -20 under
];

describe("sortRecords / filterRecords", () => {
  it("sorts descending with missing values always last", () => {
    expect(sortRecords(ROWS, "forecast_mw", "desc").map((r) => r.forecast_mw)).toEqual([100, 70, null]);
    expect(sortRecords(ROWS, "forecast_mw", "asc").map((r) => r.forecast_mw)).toEqual([70, 100, null]);
  });
  it("filters by direction and by matched/missing", () => {
    expect(filterRecords(ROWS, "over", "", "UTC")).toHaveLength(1);
    expect(filterRecords(ROWS, "under", "", "UTC")).toHaveLength(1);
    expect(filterRecords(ROWS, "missing", "", "UTC")).toHaveLength(1);
    expect(filterRecords(ROWS, "matched", "", "UTC")).toHaveLength(2);
  });
  it("searches formatted time and numbers", () => {
    expect(filterRecords(ROWS, "all", "01:00", "UTC")).toHaveLength(1);
    expect(filterRecords(ROWS, "all", "85", "UTC")).toHaveLength(1);
  });
});

describe("ForecastTable", () => {
  it("renders missing values as a dash, never as zero, and signs the error", () => {
    render(<ForecastTable records={ROWS} tz="UTC" />);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(4);
    const missing = within(rows[2]).getAllByRole("cell");
    expect(missing[1]).toHaveTextContent("–");
    expect(missing[4]).toHaveTextContent("–");
    expect(within(rows[1]).getAllByRole("cell")[4]).toHaveTextContent("+20");
    expect(within(rows[3]).getAllByRole("cell")[4]).toHaveTextContent("−20");
  });

  it("filters via the selector and reports counts", async () => {
    render(<ForecastTable records={ROWS} tz="UTC" />);
    await userEvent.selectOptions(screen.getByLabelText("Show"), "under");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText(/1 of 3 periods/)).toBeInTheDocument();
  });

  it("sorts when a header is clicked", async () => {
    render(<ForecastTable records={ROWS} tz="UTC" />);
    await userEvent.click(screen.getByRole("button", { name: /Actual \(MW\)/ }));
    await userEvent.click(screen.getByRole("button", { name: /Actual \(MW\)/ }));
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell")[3]).toHaveTextContent("90");
  });
});
