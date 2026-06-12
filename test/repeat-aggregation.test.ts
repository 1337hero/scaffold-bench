import { describe, expect, it } from "bun:test";
import { computeEfficiency, median, summarizeRepeatRuns } from "../lib/aggregates.ts";

describe("median", () => {
  it("returns the middle value for an odd count", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the middle two for an even count", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("throws on empty input", () => {
    expect(() => median([])).toThrow();
  });
});

describe("summarizeRepeatRuns", () => {
  it("summarizes totals across runs", () => {
    expect(summarizeRepeatRuns([180, 200, 190])).toEqual({
      runs: 3,
      medianPoints: 190,
      minPoints: 180,
      maxPoints: 200,
      spread: 20,
    });
  });
});

describe("computeEfficiency", () => {
  it("computes points per minute", () => {
    expect(computeEfficiency(120, 600_000)).toBe(12);
  });

  it("returns 0 for zero wall time", () => {
    expect(computeEfficiency(120, 0)).toBe(0);
  });
});
