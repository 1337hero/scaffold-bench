import { describe, test, expect } from "bun:test";
import {
  computeTokenMeans,
  paretoFrontier,
} from "../lib/report-data.ts";

describe("computeTokenMeans", () => {
  test("avgTokensPerScenario divides by metricScenarioRuns, not blanket run count", () => {
    // 1000 tokens across 2 metric-contributing scenario-runs → 500/scen.
    // A blanket denominator of 5 (incl. 3 exempt/timeout rows with no metrics) would wrongly
    // yield 200 — exactly the flaky-model deflation bug this guards against.
    const means = computeTokenMeans(1000, 2, 600, 400, 1);
    expect(means.avgTokensPerScenario).toBe(500);
    expect(means.avgTokensPerRun).toBe(1000);
    expect(means.promptTokensAvg).toBe(600);
    expect(means.completionTokensAvg).toBe(400);
  });

  test("zero metricScenarioRuns yields zero avgTokensPerScenario (not NaN)", () => {
    const means = computeTokenMeans(0, 0, 0, 0, 3);
    expect(means.avgTokensPerScenario).toBe(0);
    expect(means.avgTokensPerRun).toBe(0);
  });

  test("avgTokensPerRun divides by runCount even when metricScenarioRuns is 0", () => {
    const means = computeTokenMeans(9000, 0, 5000, 4000, 3);
    expect(means.avgTokensPerScenario).toBe(0); // no metric-contributing scenario-runs
    expect(means.avgTokensPerRun).toBe(3000);
    expect(means.promptTokensAvg).toBeCloseTo(1666.67, 1);
    expect(means.completionTokensAvg).toBeCloseTo(1333.33, 1);
  });
});

describe("paretoFrontier", () => {
  test("returns indices of non-dominated points (low tokens, high score)", () => {
    // A: 1k tokens, 80%  B: 2k, 90%  C: 3k, 90%  D: 4k, 70%
    // B dominates C (fewer tokens, equal score). A and B are non-dominated. D dominated by A.
    const pts = [
      { idx: 0, tokens: 1000, score: 80 },
      { idx: 1, tokens: 2000, score: 90 },
      { idx: 2, tokens: 3000, score: 90 },
      { idx: 3, tokens: 4000, score: 70 },
    ];
    expect(paretoFrontier(pts).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  test("equal points (same tokens AND same score) tie — both kept", () => {
    const pts = [
      { idx: 0, tokens: 1000, score: 80 },
      { idx: 1, tokens: 1000, score: 80 },
    ];
    expect(paretoFrontier(pts).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  test("a higher-score-but-higher-token point is non-dominated", () => {
    // Neither dominates the other: A cheaper, B higher score.
    const pts = [
      { idx: 0, tokens: 1000, score: 70 },
      { idx: 1, tokens: 3000, score: 95 },
    ];
    expect(paretoFrontier(pts).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  test("zero-token points are NOT given special treatment by the helper", () => {
    // The helper is pure; zero-token exclusion is the caller's job (buildReportData filters
    // tokens > 0 before calling). Here a 0-token point at 50% is non-dominated unless another
    // point has <=0 tokens AND >=50%. The 1k/80% point has higher tokens, so does not dominate.
    const pts = [
      { idx: 0, tokens: 0, score: 50 },
      { idx: 1, tokens: 1000, score: 80 },
    ];
    expect(paretoFrontier(pts).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  test("empty input returns empty", () => {
    expect(paretoFrontier([])).toEqual([]);
  });
});
