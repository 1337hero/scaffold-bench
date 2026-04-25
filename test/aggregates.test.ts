import { describe, test, expect } from "bun:test";
import {
  TOOL_NAMES,
  computeRunTotals,
  computeStatusBreakdown,
  countStatus,
  computeCategoryRollups,
  computeMisses,
  totalToolCalls,
  totalWallTime,
  findActiveIndex,
  selectActiveMetrics,
  selectFinalMetrics,
  selectMergedMetrics,
  selectDisplayMetrics,
  computeScenarioMetrics,
  computeElapsed,
  type ScenarioLike,
} from "../lib/aggregates.ts";
import type { Category, ModelMetrics, ScenarioResult } from "../lib/scoring.ts";
import { FIXTURE_RESULTS } from "./fixtures/run-results.ts";

const CATS: Category[] = [
  "surgical-edit",
  "audit",
  "scope-discipline",
  "read-only-analysis",
  "verify-and-repair",
  "implementation",
  "responsiveness",
  "long-context",
];

function viewFromResult(r: ScenarioResult, stage: ScenarioLike["stage"] = "done"): ScenarioLike {
  return {
    id: r.scenarioId,
    category: r.category,
    stage,
    startedAt: 1000,
    finishedAt: 1000 + r.output.wallTimeMs,
    toolCalls: r.output.toolCalls,
    liveMetrics: r.output.modelMetrics,
    result: r,
  };
}

const VIEWS: ScenarioLike[] = FIXTURE_RESULTS.map((r) => viewFromResult(r));

describe("TOOL_NAMES", () => {
  test("has all expected keys", () => {
    expect(TOOL_NAMES.bash).toBe("bash");
    expect(TOOL_NAMES.edit).toBe("edit");
    expect(TOOL_NAMES.write).toBe("write");
    expect(TOOL_NAMES.read).toBe("read");
    expect(TOOL_NAMES.grep).toBe("grep");
    expect(TOOL_NAMES.glob).toBe("glob");
    expect(TOOL_NAMES.ls).toBe("ls");
  });
});

describe("computeRunTotals", () => {
  test("happy path", () => {
    const t = computeRunTotals(VIEWS);
    expect(t.totalPoints).toBe(6);
    expect(t.maxPoints).toBe(12);
    expect(t.completed).toBe(6);
    expect(t.total).toBe(6);
  });
  test("empty", () => {
    expect(computeRunTotals([])).toEqual({ totalPoints: 0, maxPoints: 0, completed: 0, total: 0 });
  });
  test("pending scenarios don't count as completed", () => {
    const v: ScenarioLike[] = [{ id: "x", category: "audit", stage: "pending", toolCalls: [] }];
    expect(computeRunTotals(v).completed).toBe(0);
  });
});

describe("computeStatusBreakdown", () => {
  test("happy", () => {
    expect(computeStatusBreakdown(VIEWS)).toEqual({ pass: 2, partial: 2, fail: 2 });
  });
  test("empty", () => {
    expect(computeStatusBreakdown([])).toEqual({ pass: 0, partial: 0, fail: 0 });
  });
});

describe("countStatus", () => {
  test("counts each status", () => {
    expect(countStatus("pass", FIXTURE_RESULTS)).toBe(2);
    expect(countStatus("partial", FIXTURE_RESULTS)).toBe(2);
    expect(countStatus("fail", FIXTURE_RESULTS)).toBe(2);
  });
  test("empty", () => {
    expect(countStatus("pass", [])).toBe(0);
  });
});

describe("computeCategoryRollups", () => {
  test("aggregates by category and skips empty", () => {
    const rows = computeCategoryRollups(VIEWS, CATS);
    const audit = rows.find((r) => r.category === "audit");
    expect(audit).toEqual({ category: "audit", points: 3, maxPoints: 4 });
    expect(rows.some((r) => r.category === "responsiveness")).toBe(false);
  });
  test("empty", () => {
    expect(computeCategoryRollups([], CATS)).toEqual([]);
  });
});

describe("computeMisses", () => {
  test("returns structured failing-check rows", () => {
    const m = computeMisses(VIEWS);
    expect(m.length).toBe(5);
    expect(m[0]).toMatchObject({ scenarioId: "SB-02", checkName: "proposed fix" });
    expect(m[0].detail).toContain("missed the null-branch");
  });
  test("empty", () => {
    expect(computeMisses([])).toEqual([]);
  });
});

describe("totalToolCalls", () => {
  test("prefers result.output.toolCalls when present", () => {
    expect(totalToolCalls(VIEWS)).toBe(14);
  });
  test("falls back to live toolCalls when no result", () => {
    const v: ScenarioLike[] = [
      {
        id: "x",
        category: "audit",
        stage: "running",
        toolCalls: [{ name: "bash", args: "", turn: 1 }],
      },
    ];
    expect(totalToolCalls(v)).toBe(1);
  });
  test("empty", () => {
    expect(totalToolCalls([])).toBe(0);
  });
});

describe("totalWallTime", () => {
  test("sums wallTimeMs", () => {
    expect(totalWallTime(FIXTURE_RESULTS)).toBe(64000);
  });
  test("empty", () => {
    expect(totalWallTime([])).toBe(0);
  });
});

describe("findActiveIndex", () => {
  test("returns index of first running", () => {
    const v: ScenarioLike[] = [
      { id: "a", category: "audit", stage: "done", toolCalls: [] },
      { id: "b", category: "audit", stage: "running", toolCalls: [] },
      { id: "c", category: "audit", stage: "running", toolCalls: [] },
    ];
    expect(findActiveIndex(v)).toBe(1);
  });
  test("returns undefined when nothing running", () => {
    expect(findActiveIndex(VIEWS)).toBeUndefined();
  });
  test("empty", () => {
    expect(findActiveIndex([])).toBeUndefined();
  });
});

describe("selectActiveMetrics", () => {
  test("returns liveMetrics of running scenario", () => {
    const metrics: ModelMetrics = {
      requestCount: 1,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      totalRequestTimeMs: 100,
    };
    const v: ScenarioLike[] = [
      { id: "a", category: "audit", stage: "running", toolCalls: [], liveMetrics: metrics },
    ];
    expect(selectActiveMetrics(v)).toBe(metrics);
  });
  test("undefined when nothing running", () => {
    expect(selectActiveMetrics(VIEWS)).toBeUndefined();
  });
});

describe("selectFinalMetrics", () => {
  test("returns state.modelMetrics", () => {
    const m: ModelMetrics = {
      requestCount: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      totalRequestTimeMs: 1,
    };
    expect(selectFinalMetrics({ modelMetrics: m })).toBe(m);
  });
  test("undefined when absent", () => {
    expect(selectFinalMetrics({})).toBeUndefined();
  });
});

describe("selectMergedMetrics", () => {
  test("merges across scenarios", () => {
    const m = selectMergedMetrics(VIEWS);
    expect(m).toBeDefined();
    expect(m!.requestCount).toBeGreaterThan(0);
  });
  test("undefined when no metrics", () => {
    const v: ScenarioLike[] = [{ id: "x", category: "audit", stage: "pending", toolCalls: [] }];
    expect(selectMergedMetrics(v)).toBeUndefined();
  });
});

describe("selectDisplayMetrics", () => {
  test("prioritizes active > final > merged", () => {
    const active: ModelMetrics = {
      requestCount: 1,
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      totalRequestTimeMs: 1,
    };
    const final: ModelMetrics = {
      requestCount: 99,
      promptTokens: 99,
      completionTokens: 99,
      totalTokens: 198,
      totalRequestTimeMs: 99,
    };
    const running: ScenarioLike[] = [
      { id: "a", category: "audit", stage: "running", toolCalls: [], liveMetrics: active },
    ];
    expect(selectDisplayMetrics(running, { modelMetrics: final })).toBe(active);

    const doneOnly: ScenarioLike[] = [{ id: "a", category: "audit", stage: "done", toolCalls: [] }];
    expect(selectDisplayMetrics(doneOnly, { modelMetrics: final })).toBe(final);
    expect(selectDisplayMetrics(doneOnly, {})).toBeUndefined();
  });
});

describe("computeScenarioMetrics", () => {
  test("counts bash + edits, pulls timing", () => {
    const view = VIEWS[0];
    const m = computeScenarioMetrics(view);
    expect(m.toolCount).toBe(3);
    expect(m.bashCalls).toBe(1);
    expect(m.edits).toBe(2);
    expect(m.firstTokenMs).toBe(420);
    expect(m.turnWallTimes).toEqual([6000, 6000]);
  });
  test("handles empty toolCalls, missing result", () => {
    const v: ScenarioLike = { id: "x", category: "audit", stage: "pending", toolCalls: [] };
    expect(computeScenarioMetrics(v)).toEqual({ toolCount: 0, bashCalls: 0, edits: 0 });
  });
});

describe("computeElapsed", () => {
  test("uses result.wallTimeMs when present", () => {
    expect(computeElapsed(VIEWS[0])).toBe(12000);
  });
  test("uses finishedAt - startedAt when no result", () => {
    const v: ScenarioLike = {
      id: "x",
      category: "audit",
      stage: "done",
      startedAt: 1000,
      finishedAt: 3500,
      toolCalls: [],
    };
    expect(computeElapsed(v)).toBe(2500);
  });
  test("uses Date.now fallback when still running", () => {
    const v: ScenarioLike = {
      id: "x",
      category: "audit",
      stage: "running",
      startedAt: Date.now() - 50,
      toolCalls: [],
    };
    const e = computeElapsed(v);
    expect(e).toBeGreaterThanOrEqual(0);
    expect(e).toBeLessThan(500);
  });
  test("returns 0 when no startedAt", () => {
    const v: ScenarioLike = { id: "x", category: "audit", stage: "pending", toolCalls: [] };
    expect(computeElapsed(v)).toBe(0);
  });
});
