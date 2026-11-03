import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateFilters } from "./DateFilters";

function setup(over: Partial<React.ComponentProps<typeof DateFilters>> = {}) {
  const onRange = vi.fn();
  const onMode = vi.fn();
  render(
    <DateFilters min="2026-01-01" max="2026-01-31" start="2026-01-01" end="2026-01-31" mode="decision"
      cutoffLabel="09:00 Europe/London, the day before delivery" onRange={onRange} onMode={onMode} {...over} />,
  );
  return { onRange, onMode };
}

describe("DateFilters", () => {
  it("constrains date inputs to the analysis window", () => {
    setup();
    const start = screen.getByLabelText("Start date");
    expect(start).toHaveAttribute("min", "2026-01-01");
    expect(start).toHaveAttribute("max", "2026-01-31");
  });

  it("emits a new range when the start date changes", () => {
    const { onRange } = setup();
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-01-10" } });
    expect(onRange).toHaveBeenCalledWith("2026-01-10", "2026-01-31");
  });

  it("pushes the end date forward if the start is moved past it", () => {
    const { onRange } = setup({ start: "2026-01-01", end: "2026-01-05" });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-01-20" } });
    expect(onRange).toHaveBeenCalledWith("2026-01-20", "2026-01-20");
  });

  it("single-day picker sets start and end to the same day", () => {
    const { onRange } = setup();
    fireEvent.change(screen.getByLabelText("Single day"), { target: { value: "2026-01-12" } });
    expect(onRange).toHaveBeenCalledWith("2026-01-12", "2026-01-12");
  });

  it("switches forecast mode and states the active cutoff", async () => {
    const { onMode } = setup();
    expect(screen.getByText(/09:00 Europe\/London/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Latest available forecast"));
    expect(onMode).toHaveBeenCalledWith("latest");
  });

  it("quick ranges include the full month", async () => {
    const { onRange } = setup({ start: "2026-01-05", end: "2026-01-05" });
    await userEvent.click(screen.getByRole("button", { name: "Full month" }));
    expect(onRange).toHaveBeenCalledWith("2026-01-01", "2026-01-31");
  });
});
