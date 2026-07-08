import { describe, test, expect } from "bun:test";
import {
  binomialPMF,
  signTestPValue,
  scenarioSolveRates,
  type SolveRow,
} from "../scripts/compare-models.ts";

describe("binomialPMF", () => {
  test("sums to 1 across all k for a given n", () => {
    const n = 10;
    let total = 0;
    for (let k = 0; k <= n; k++) total += binomialPMF(n, k);
    expect(total).toBeCloseTo(1, 10);
  });

  test("matches known coin-flip probabilities", () => {
    expect(binomialPMF(2, 1)).toBeCloseTo(0.5, 10);
    expect(binomialPMF(4, 0)).toBeCloseTo(0.0625, 10);
    expect(binomialPMF(4, 4)).toBeCloseTo(0.0625, 10);
  });
});

describe("signTestPValue", () => {
  test("returns 1 for a perfect tie of wins and losses", () => {
    expect(signTestPValue(5, 5)).toBeCloseTo(1, 10);
  });

  test("returns 1 when there are no comparisons", () => {
    expect(signTestPValue(0, 0)).toBe(1);
  });

  test("is symmetric in wins and losses", () => {
    expect(signTestPValue(20, 3)).toBeCloseTo(signTestPValue(3, 20), 10);
  });

  test("is significant for a lopsided result", () => {
    expect(signTestPValue(21, 2)).toBeLessThan(0.001);
  });

  test("is not significant for a near-even split", () => {
    expect(signTestPValue(11, 9)).toBeGreaterThan(0.5);
  });
});

describe("scenarioSolveRates", () => {
  test("treats correctness=3 as solved and everything else as not solved", () => {
    const rows: SolveRow[] = [
      { scenarioId: "SB-01", correctness: 3 },
      { scenarioId: "SB-01", correctness: 2 },
      { scenarioId: "SB-01", correctness: null },
    ];
    const rates = scenarioSolveRates(rows);
    expect(rates.get("SB-01")).toEqual({ n: 3, solveRate: 1 / 3 });
  });

  test("keeps scenarios independent", () => {
    const rows: SolveRow[] = [
      { scenarioId: "SB-01", correctness: 3 },
      { scenarioId: "SB-02", correctness: 0 },
    ];
    const rates = scenarioSolveRates(rows);
    expect(rates.get("SB-01")?.solveRate).toBe(1);
    expect(rates.get("SB-02")?.solveRate).toBe(0);
  });
});
