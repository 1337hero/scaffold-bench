import { describe, test, expect } from "bun:test";
import { wilsonInterval, computeSolveStats, type SolveDimRow } from "../lib/report-data.ts";

describe("wilsonInterval", () => {
  test("zero attempts returns zero-width interval at zero", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  });

  test("known interval: 8/10 successes at z=1.96", () => {
    const { low, high } = wilsonInterval(8, 10);
    expect(low).toBeCloseTo(49.02, 1);
    expect(high).toBeCloseTo(94.34, 1);
  });

  test("100% success narrows but does not exceed 100", () => {
    const { low, high } = wilsonInterval(10, 10);
    expect(high).toBeLessThanOrEqual(100);
    expect(low).toBeGreaterThan(0);
  });

  test("0% success does not go below 0", () => {
    const { low, high } = wilsonInterval(0, 10);
    expect(low).toBe(0);
    expect(high).toBeGreaterThan(0);
  });
});

describe("computeSolveStats", () => {
  function row(overrides: Partial<SolveDimRow> = {}): SolveDimRow {
    return { correctness: 3, scope: 2, pattern: 2, verification: 1, cleanup: 2, ...overrides };
  }

  test("no rows yields zeroed stats", () => {
    expect(computeSolveStats([])).toEqual({
      solveAttempts: 0,
      solveCount: 0,
      solveRatePct: 0,
      solveCiLowPct: 0,
      solveCiHighPct: 0,
      disciplinePct: 0,
    });
  });

  test("counts only correctness=3 rows as solves", () => {
    const rows = [row({ correctness: 3 }), row({ correctness: 2 }), row({ correctness: 0 })];
    const stats = computeSolveStats(rows);
    expect(stats.solveAttempts).toBe(3);
    expect(stats.solveCount).toBe(1);
    expect(stats.solveRatePct).toBeCloseTo(33.33, 1);
  });

  test("disciplinePct averages process dimensions out of 7, skipping all-null rows", () => {
    const rows = [
      row({ scope: 2, pattern: 2, verification: 1, cleanup: 2 }), // 7/7 = 100
      row({ scope: 0, pattern: 0, verification: 0, cleanup: 0 }), // 0/7 = 0
      row({ scope: null, pattern: null, verification: null, cleanup: null }), // skipped
    ];
    const stats = computeSolveStats(rows);
    expect(stats.disciplinePct).toBeCloseTo(50, 5);
  });
});
