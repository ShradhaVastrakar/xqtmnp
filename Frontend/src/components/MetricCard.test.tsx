import { render, screen } from "@testing-library/react";
import { MetricCard } from "./MetricCard";

describe("MetricCard", () => {
  it("shows label, value, unit and an accessible explanation", () => {
    render(<MetricCard label="Mean absolute error" value="2,127" unit="MW" hint="Average size of the miss." />);
    expect(screen.getByRole("heading", { name: "Mean absolute error" })).toBeInTheDocument();
    expect(screen.getByText("2,127")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Average size of the miss.");
    expect(screen.getByRole("button", { name: /about mean absolute error/i })).toHaveAttribute("aria-describedby", screen.getByRole("tooltip", { hidden: true }).id);
  });
});
