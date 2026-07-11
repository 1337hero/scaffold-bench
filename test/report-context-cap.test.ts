import { describe, test, expect } from "bun:test";
import {
  CONTEXT_CAPS,
  computeSolveRateByContextCap,
  peakContextTokens,
} from "../lib/report-data.ts";

describe("peakContextTokens", () => {
  test("takes the max of prompt+completion across requests, not the final request", () => {
    // Mid-run spike (big file read that later scrolls off): final request is
    // small, but the 60k spike is what a real cap would bind on.
    const requests = [
      { promptTokens: 2000, completionTokens: 500 },
      { promptTokens: 58_000, completionTokens: 2000 }, // spike: 60k
      { promptTokens: 12_000, completionTokens: 800 },
    ];
    expect(peakContextTokens(requests)).toBe(60_000);
  });

  test("empty series yields 0", () => {
    expect(peakContextTokens([])).toBe(0);
  });
});

describe("computeSolveRateByContextCap", () => {
  test("solved runs over the cap count against, same as unsolved", () => {
    // One solve at 10k peak, one solve at 100k peak, one fail at 5k peak.
    const rows = [
      { solved: true, peak: 10_000 },
      { solved: true, peak: 100_000 },
      { solved: false, peak: 5_000 },
    ];
    const curve = computeSolveRateByContextCap(rows, [16_384, 131_072])!;
    expect(curve.attempts).toBe(3);
    // At 16k: only the 10k solve fits. At 128k: both solves fit; the fail never counts.
    expect(curve.points).toEqual([
      { cap: 16_384, solved: 1, pct: 100 / 3 },
      { cap: 131_072, solved: 2, pct: 200 / 3 },
    ]);
  });

  test("denominator is all attempts at every cap — quitting early can't inflate the curve", () => {
    // A model that solves only its cheap runs: pct stays pinned to total attempts.
    const rows = [
      { solved: true, peak: 4_000 },
      { solved: false, peak: 2_000 },
      { solved: false, peak: 3_000 },
      { solved: false, peak: 1_000 },
    ];
    const curve = computeSolveRateByContextCap(rows, CONTEXT_CAPS)!;
    for (const p of curve.points) expect(p.pct).toBe(25);
  });

  test("curve is monotonically non-decreasing in the cap", () => {
    const rows = [
      { solved: true, peak: 7_000 },
      { solved: true, peak: 30_000 },
      { solved: true, peak: 120_000 },
      { solved: false, peak: 9_000 },
    ];
    const curve = computeSolveRateByContextCap(rows, CONTEXT_CAPS)!;
    for (let i = 1; i < curve.points.length; i++) {
      expect(curve.points[i].pct).toBeGreaterThanOrEqual(curve.points[i - 1].pct);
    }
    expect(curve.points[curve.points.length - 1].solved).toBe(3);
  });

  test("a peak exactly at the cap counts as fitting", () => {
    const curve = computeSolveRateByContextCap([{ solved: true, peak: 8192 }], [8192])!;
    expect(curve.points[0]).toEqual({ cap: 8192, solved: 1, pct: 100 });
  });

  test("no rows yields undefined so the aggregate omits the field", () => {
    expect(computeSolveRateByContextCap([])).toBeUndefined();
  });
});
