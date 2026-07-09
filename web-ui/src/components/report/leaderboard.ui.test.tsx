import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Leaderboard } from "./Leaderboard";
import type { ReportModelAggregate } from "@/types";

function model(id: string, overrides: Partial<ReportModelAggregate> = {}): ReportModelAggregate {
  return {
    model: id,
    source: "local",
    runs: 1,
    scorePct: 0,
    solveAttempts: 0,
    solveCount: 0,
    solveRatePct: 0,
    solveCiLowPct: 0,
    solveCiHighPct: 0,
    disciplinePct: 0,
    pointsAvg: 0,
    maxAvg: 0,
    totalWallSeconds: 0,
    avgScenarioSeconds: 0,
    avgFirstTokenSeconds: null,
    completionTps: null,
    completionTpsApprox: false,
    promptTps: null,
    promptTpsApprox: false,
    toolCallsTotal: 0,
    requests: 0,
    timeouts: 0,
    exemptScenarios: 0,
    categories: {},
    tiers: {},
    scenarioCount: 0,
    latestTimestamp: "",
    ...overrides,
  };
}

const models = [
  model("low-solve-high-blend", { solveRatePct: 20, scorePct: 90, disciplinePct: 50 }),
  model("high-solve-low-blend", { solveRatePct: 80, scorePct: 40, disciplinePct: 70 }),
];

describe("Leaderboard", () => {
  afterEach(() => cleanup());

  test("defaults to sorting by Score (solve rate) descending, ignoring blended scorePct", () => {
    render(<Leaderboard models={models} />);
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0].textContent).toContain("high-solve-low-blend");
    expect(rows[1].textContent).toContain("low-solve-high-blend");
  });

  test("renders a single Score column and no Discipline, blended Score, or Exempt columns", () => {
    render(<Leaderboard models={models} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent ?? "");
    expect(headers.filter((h) => h.includes("Score"))).toHaveLength(1);
    expect(headers.some((h) => h.includes("Solve %"))).toBe(false);
    expect(headers.some((h) => h.includes("Discipline"))).toBe(false);
    expect(headers.some((h) => h.includes("Exempt"))).toBe(false);
  });

  test("Score cell shows the rate with a ± CI margin", () => {
    render(
      <Leaderboard
        models={[model("m", { solveRatePct: 72.4, solveCiLowPct: 64.3, solveCiHighPct: 80.5 })]}
      />
    );
    const row = screen.getAllByRole("row")[1];
    expect(row.textContent).toContain("72.4%");
    expect(row.textContent).toContain("±8.1");
  });

  test("clicking Score toggles to ascending", async () => {
    const user = userEvent.setup();
    render(<Leaderboard models={models} />);
    await user.click(screen.getByText("Score"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("low-solve-high-blend");
  });
});
