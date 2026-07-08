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
    scenarioCount: 0,
    latestTimestamp: "",
    ...overrides,
  };
}

const models = [
  model("low-solve-high-score", { solveRatePct: 20, scorePct: 90, disciplinePct: 50 }),
  model("high-solve-low-score", { solveRatePct: 80, scorePct: 40, disciplinePct: 70 }),
];

describe("Leaderboard", () => {
  afterEach(() => cleanup());

  test("defaults to sorting by Solve % descending, not Score", () => {
    render(<Leaderboard models={models} />);
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0].textContent).toContain("high-solve-low-score");
    expect(rows[1].textContent).toContain("low-solve-high-score");
  });

  test("renders Solve % and Discipline % columns before Score", () => {
    render(<Leaderboard models={models} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    const solveIdx = headers.findIndex((h) => h?.includes("Solve %"));
    const disciplineIdx = headers.findIndex((h) => h?.includes("Discipline %"));
    const scoreIdx = headers.findIndex((h) => h === "Score");
    expect(solveIdx).toBeGreaterThanOrEqual(0);
    expect(disciplineIdx).toBeGreaterThan(solveIdx);
    expect(scoreIdx).toBeGreaterThan(disciplineIdx);
  });

  test("clicking Score header re-sorts by scorePct descending", async () => {
    const user = userEvent.setup();
    render(<Leaderboard models={models} />);
    await user.click(screen.getByText("Score"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("low-solve-high-score");
  });
});
