import { describe, test, expect } from "bun:test";
import {
  meanContextPerTurn,
  contextPerTurnByHarness,
  positionalMeans,
} from "../lib/report-data.ts";

describe("meanContextPerTurn", () => {
  test("null when no contributing rows", () => {
    expect(meanContextPerTurn([])).toBeNull();
  });

  test("mean of per-run ratios — a single long run must not dominate", () => {
    // run A: 8k prompt / 4 requests = 2000; run B: 12k / 2 = 6000
    // mean-of-ratios = 4000; Σprompt/Σrequests = 20000/6 ≈ 3333 (would smear)
    expect(meanContextPerTurn([2000, 6000])).toBeCloseTo(4000, 5);
  });

  test("zero-requestCount / zero-prompt rows are excluded upstream by the >0 guard", () => {
    // Ratios pushed only when both promptTokens>0 and requestCount>0; here we just
    // confirm the helper averages whatever non-empty ratios it receives.
    expect(meanContextPerTurn([1000, 3000])).toBeCloseTo(2000, 5);
  });
});

describe("contextPerTurnByHarness", () => {
  test("undefined when fewer than 2 harnesses have data", () => {
    expect(contextPerTurnByHarness([{ harness: "native", ratio: 8000 }])).toBeUndefined();
    expect(contextPerTurnByHarness([])).toBeUndefined();
  });

  test("emits per-harness means when ≥2 harnesses", () => {
    const rows = [
      { harness: "native", ratio: 8000 },
      { harness: "native", ratio: 12000 },
      { harness: "hermes", ratio: 20000 },
      { harness: "hermes", ratio: 12000 },
    ];
    expect(contextPerTurnByHarness(rows)).toEqual({
      native: 10000,
      hermes: 16000,
    });
  });

  test("null harness grouped under 'unknown'", () => {
    const out = contextPerTurnByHarness([
      { harness: null, ratio: 5000 },
      { harness: "native", ratio: 7000 },
    ]);
    expect(out).toEqual({ unknown: 5000, native: 7000 });
  });
});

describe("positionalMeans", () => {
  test("empty when no series", () => {
    expect(positionalMeans([])).toEqual([]);
  });

  test("ragged series — runs ending at different turns", () => {
    // run1 reached turn 3: [1000, 2000, 3000]
    // run2 reached turn 2: [1500, 2500]
    const series = [
      [{ promptTokens: 1000 }, { promptTokens: 2000 }, { promptTokens: 3000 }],
      [{ promptTokens: 1500 }, { promptTokens: 2500 }],
    ];
    expect(positionalMeans(series)).toEqual([
      { turn: 1, meanPromptTokens: 1250, runs: 2 },
      { turn: 2, meanPromptTokens: 2250, runs: 2 },
      { turn: 3, meanPromptTokens: 3000, runs: 1 }, // survivor-biased
    ]);
  });

  test("empty inner series contributes nothing", () => {
    const series: Array<Array<{ promptTokens: number }>> = [[], [{ promptTokens: 42 }]];
    expect(positionalMeans(series)).toEqual([{ turn: 1, meanPromptTokens: 42, runs: 1 }]);
  });
});
