import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dashboard from "./Dashboard";

// Synthetic test fixtures – not real Elexon data.
const META = {
  timezone: "Europe/London", analysis_start: "2026-01-01", analysis_end: "2026-01-31", expected_periods: 1488,
  decision_cutoff_time: "09:00", decision_cutoff_days_ahead: 1, decision_cutoff_description: "Assumption text.",
  cutoff_is_assumption: true, hourly_forecast_fill: "none", forecast_native_resolution_minutes: 60,
  min_valid_periods_per_day: 12, mape_min_actual_mw: 100, data_sources: [], data_source: "cache",
  data_fetched_at: "2026-10-29T07:34:08Z", data_is_stale: false,
};
const summary = (mae: number) => ({
  n_expected: 1488, n_valid: 744, n_missing_forecast: 744, n_missing_actual: 0, coverage_pct: 50, mae, rmse: 2606.1,
  bias: 1851.5, mape_pct: 22.2, mape_n: 744, n_overestimated: 631, n_underestimated: 113, n_exact: 0,
  max_abs_error: 6894, max_abs_error_time: "2026-01-12T01:00:00Z",
});

let calls: string[] = [];
function mockFetch(failAnalysis = false) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
    if (u.pathname === "/api/metadata") return ok(META);
    if (u.pathname === "/api/analysis") {
      if (failAnalysis) return { ok: false, status: 503, json: async () => ({ detail: "Elexon data is currently unavailable" }) } as Response;
      const mode = u.searchParams.get("mode");
      return ok({ mode, start: u.searchParams.get("start"), end: u.searchParams.get("end"), summary: summary(mode === "latest" ? 1764 : 2127), daily: [], data_source: "cache", data_fetched_at: META.data_fetched_at });
    }
    return ok({ mode: u.searchParams.get("mode"), start: "", end: "", count: 0, records: [] });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("Dashboard", () => {
  it("shows backend-calculated KPIs and the active cutoff", async () => {
    mockFetch();
    render(<Dashboard />);
    expect(await screen.findByText("2,127")).toBeInTheDocument();
    expect(screen.getByText("+1,852")).toBeInTheDocument();
    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getAllByText(/09:00 Europe\/London/).length).toBeGreaterThan(0);
  });

  it("re-requests analysis and forecasts with the selected mode and dates", async () => {
    mockFetch();
    render(<Dashboard />);
    await screen.findByText("2,127");
    await userEvent.click(screen.getByLabelText("Latest available forecast"));
    expect(await screen.findByText("1,764")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Single day"), { target: { value: "2026-01-12" } });
    await waitFor(() => expect(calls.some((c) => c.includes("/api/analysis") && c.includes("start=2026-01-12") && c.includes("end=2026-01-12") && c.includes("mode=latest"))).toBe(true));
    await waitFor(() => expect(calls.some((c) => c.includes("/api/forecasts") && c.includes("start=2026-01-12") && c.includes("mode=latest"))).toBe(true));
  });

  it("shows a clear error with retry when the backend is unavailable", async () => {
    mockFetch(true);
    render(<Dashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Elexon data is currently unavailable");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains the hourly-forecast resolution limitation", async () => {
    mockFetch();
    render(<Dashboard />);
    expect(await screen.findByText(/published hourly/i)).toBeInTheDocument();
  });
});
