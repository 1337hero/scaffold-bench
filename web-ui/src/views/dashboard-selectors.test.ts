import { describe, expect, test } from "bun:test";
import {
  getFocusedScenario,
  getCategoryRollups,
  getLivePoints,
  getDisplayedPoints,
  getModel,
  getCallCounts,
  isRunComplete,
  isScoreExempt,
  scoreableRows,
  matchesFilters,
  filterRows,
  scorePct,
  behavioralRows,
  behavioralScorePct,
  browserRows,
  browserScorePct,
  hiddenTestPassRate,
  pointsPerToolCall,
  timeCostSlice,
  dimensionAverages,
} from "./dashboard-selectors";
import type { RunState, ScenarioRun, ScenarioState, ScenarioStatus } from "@/types";

function scenario(id: string, overrides: Partial<ScenarioState> = {}): ScenarioState {
  return {
    id,
    name: id,
    category: "core",
    maxPoints: 10,
    status: "pending" as ScenarioStatus,
    logs: [],
    streamBuffer: "",
    ...overrides,
  };
}

function runState(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: "run-1",
    status: "running",
    scenarios: [],
    activeScenarioId: null,
    focusedScenarioId: null,
    totalPoints: 0,
    maxPoints: 0,
    ...overrides,
  };
}

describe("getFocusedScenario", () => {
  test("prefers focusedScenarioId when set", () => {
    const state = runState({
      scenarios: [scenario("SB-01"), scenario("SB-02")],
      activeScenarioId: "SB-01",
      focusedScenarioId: "SB-02",
    });
    expect(getFocusedScenario(state)?.id).toBe("SB-02");
  });
  test("falls back to activeScenarioId when not focused", () => {
    const state = runState({
      scenarios: [scenario("SB-01"), scenario("SB-02")],
      activeScenarioId: "SB-01",
    });
    expect(getFocusedScenario(state)?.id).toBe("SB-01");
  });
  test("undefined when neither matches", () => {
    expect(getFocusedScenario(runState())).toBeUndefined();
  });
});

describe("getCategoryRollups", () => {
  test("ignores pending and running scenarios", () => {
    const state = runState({
      scenarios: [
        scenario("SB-01", { status: "pass", points: 10, category: "core" }),
        scenario("SB-02", { status: "running", category: "core" }),
        scenario("SB-03", { status: "pending", category: "core" }),
      ],
    });
    const rollups = getCategoryRollups(state);
    expect(rollups).toEqual([{ category: "core", points: 10, maxPoints: 10 }]);
  });

  test("groups by category and sums points", () => {
    const state = runState({
      scenarios: [
        scenario("SB-01", { status: "pass", points: 10, category: "core" }),
        scenario("SB-02", { status: "fail", points: 0, category: "core" }),
        scenario("SB-03", { status: "partial", points: 5, category: "edge" }),
      ],
    });
    const byCategory = Object.fromEntries(getCategoryRollups(state).map((r) => [r.category, r]));
    expect(byCategory.core).toEqual({ category: "core", points: 10, maxPoints: 20 });
    expect(byCategory.edge).toEqual({ category: "edge", points: 5, maxPoints: 10 });
  });
});

describe("getLivePoints", () => {
  test("sums points and maxPoints across all scenarios", () => {
    const state = runState({
      scenarios: [
        scenario("SB-01", { points: 10, maxPoints: 10 }),
        scenario("SB-02", { points: 3, maxPoints: 10 }),
        scenario("SB-03", { maxPoints: 5 }),
      ],
    });
    expect(getLivePoints(state)).toEqual({ total: 13, max: 25 });
  });
});

describe("getDisplayedPoints", () => {
  test("running run uses live aggregation", () => {
    const state = runState({
      status: "running",
      totalPoints: 999,
      maxPoints: 999,
      scenarios: [scenario("SB-01", { points: 5, maxPoints: 10 })],
    });
    expect(getDisplayedPoints(state)).toEqual({ total: 5, max: 10 });
  });
  test("completed run uses persisted totals", () => {
    const state = runState({
      status: "done",
      totalPoints: 42,
      maxPoints: 100,
      scenarios: [scenario("SB-01", { points: 5, maxPoints: 10 })],
    });
    expect(getDisplayedPoints(state)).toEqual({ total: 42, max: 100 });
  });
});

describe("getModel", () => {
  test("prefers state.model when present", () => {
    const state = runState({ model: "qwen3-coder" });
    expect(getModel(state, undefined)).toBe("qwen3-coder");
  });
  test("falls back to focused scenario metrics", () => {
    const state = runState({ model: null });
    const focused = scenario("SB-01", {
      liveMetrics: {
        model: "deepseek",
        requestCount: 1,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        totalRequestTimeMs: 0,
      },
    });
    expect(getModel(state, focused)).toBe("deepseek");
  });
  test("null when nothing reports a model", () => {
    expect(getModel(runState({ model: null }), undefined)).toBeNull();
  });
});

describe("getCallCounts", () => {
  test("zeroes when no scenario is focused", () => {
    expect(getCallCounts(undefined)).toEqual({ tool: 0, bash: 0, edit: 0 });
  });
  test("reads counts from focused scenario", () => {
    const focused = scenario("SB-01", {
      toolCallCount: 7,
      bashCallCount: 3,
      editCallCount: 4,
    });
    expect(getCallCounts(focused)).toEqual({ tool: 7, bash: 3, edit: 4 });
  });
});

describe("isRunComplete", () => {
  test("done, stopped, failed are complete", () => {
    expect(isRunComplete("done")).toBe(true);
    expect(isRunComplete("stopped")).toBe(true);
    expect(isRunComplete("failed")).toBe(true);
  });
  test("idle and running are not complete", () => {
    expect(isRunComplete("idle")).toBe(false);
    expect(isRunComplete("running")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Score slices
// ---------------------------------------------------------------------------

function srun(id: string, overrides: Partial<ScenarioRun> = {}): ScenarioRun {
  return {
    scenarioId: id,
    category: "core",
    status: "pass",
    points: 0,
    maxPoints: 10,
    wallTimeMs: null,
    firstTokenMs: null,
    toolCallCount: null,
    errorKind: null,
    evaluation: null,
    modelMetrics: null,
    signalType: "regex-shape",
    evaluatorKind: "regex",
    stacks: [],
    taskType: "bugfix",
    difficulty: "small",
    surface: "backend",
    hiddenTestPassed: null,
    hiddenTestTotal: null,
    ...overrides,
  };
}

// Behavioral pass (8/10), regex-shape partial (5/10), browser/a11y (6/10),
// hidden tests, varied stacks, plus a score-exempt skipped row (maxPoints 0).
const FIXTURE: ScenarioRun[] = [
  srun("SB-01", {
    points: 8,
    maxPoints: 10,
    signalType: "behavioral",
    evaluatorKind: "unit",
    stacks: ["node", "typescript"],
    surface: "backend",
    difficulty: "small",
    taskType: "bugfix",
    toolCallCount: 4,
    wallTimeMs: 2000,
    hiddenTestPassed: 3,
    hiddenTestTotal: 4,
    modelMetrics: {
      requestCount: 1,
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      totalRequestTimeMs: 1000,
    },
  }),
  srun("SB-02", {
    points: 5,
    maxPoints: 10,
    signalType: "regex-shape",
    evaluatorKind: "regex",
    stacks: ["react", "tanstack-query"],
    surface: "frontend",
    difficulty: "medium",
    taskType: "refactor",
    toolCallCount: 6,
    wallTimeMs: 4000,
    modelMetrics: {
      requestCount: 2,
      promptTokens: 50,
      completionTokens: 100,
      totalTokens: 150,
      totalRequestTimeMs: 1000,
    },
  }),
  srun("SB-32", {
    points: 6,
    maxPoints: 10,
    signalType: "behavioral",
    evaluatorKind: "a11y",
    stacks: ["react", "typescript"],
    surface: "frontend",
    difficulty: "small",
    taskType: "bugfix",
    toolCallCount: 5,
    wallTimeMs: 3000,
    hiddenTestPassed: 2,
    hiddenTestTotal: 2,
  }),
  // Score-exempt skipped row — maxPoints 0; must be excluded everywhere.
  srun("SB-99", {
    points: 0,
    maxPoints: 0,
    status: "stopped",
    signalType: "behavioral",
    evaluatorKind: "browser",
    stacks: ["react"],
    surface: "frontend",
    toolCallCount: 99,
    wallTimeMs: 999999,
    hiddenTestPassed: 0,
    hiddenTestTotal: 5,
  }),
];

describe("score-exempt exclusion", () => {
  test("maxPoints === 0 is score-exempt", () => {
    expect(isScoreExempt(srun("x", { maxPoints: 0 }))).toBe(true);
    expect(isScoreExempt(srun("x", { maxPoints: 10 }))).toBe(false);
  });
  test("scoreableRows drops exempt rows", () => {
    expect(scoreableRows(FIXTURE).map((r) => r.scenarioId)).toEqual(["SB-01", "SB-02", "SB-32"]);
  });
});

describe("filters", () => {
  test("matchesFilters by single dimension", () => {
    expect(matchesFilters(FIXTURE[0], { surface: "backend" })).toBe(true);
    expect(matchesFilters(FIXTURE[0], { surface: "frontend" })).toBe(false);
    expect(matchesFilters(FIXTURE[0], { signalType: "behavioral" })).toBe(true);
    expect(matchesFilters(FIXTURE[1], { evaluatorKind: "regex" })).toBe(true);
  });
  test("matchesFilters stacks requires all listed stacks present", () => {
    expect(matchesFilters(FIXTURE[1], { stacks: ["react"] })).toBe(true);
    expect(matchesFilters(FIXTURE[1], { stacks: ["react", "tanstack-query"] })).toBe(true);
    expect(matchesFilters(FIXTURE[1], { stacks: ["node"] })).toBe(false);
  });
  test("filterRows excludes exempt rows then filters", () => {
    const frontend = filterRows(FIXTURE, { surface: "frontend" });
    expect(frontend.map((r) => r.scenarioId)).toEqual(["SB-02", "SB-32"]);
  });
});

describe("scorePct slices", () => {
  test("overall scorePct excludes exempt rows", () => {
    // (8+5+6) / (10+10+10) = 19/30
    expect(scorePct(FIXTURE)).toBeCloseTo((19 / 30) * 100, 5);
  });
  test("behavioralRows + behavioralScorePct", () => {
    expect(behavioralRows(FIXTURE).map((r) => r.scenarioId)).toEqual(["SB-01", "SB-32"]);
    // (8+6)/(10+10) = 14/20 = 70
    expect(behavioralScorePct(FIXTURE)).toBeCloseTo(70, 5);
  });
  test("browserRows includes browser+a11y, excludes exempt", () => {
    // SB-32 is a11y; SB-99 is browser but exempt → excluded.
    expect(browserRows(FIXTURE).map((r) => r.scenarioId)).toEqual(["SB-32"]);
    expect(browserScorePct(FIXTURE)).toBeCloseTo(60, 5);
  });
  test("returns null when no scoreable rows match", () => {
    expect(behavioralScorePct([srun("z", { maxPoints: 0 })])).toBeNull();
  });
});

describe("hiddenTestPassRate", () => {
  test("sums passed/total over rows with total>0, exempt excluded", () => {
    // SB-01: 3/4, SB-32: 2/2 → 5/6; SB-99 exempt despite total 5.
    expect(hiddenTestPassRate(FIXTURE)).toBeCloseTo((5 / 6) * 100, 5);
  });
  test("null when no hidden tests", () => {
    expect(hiddenTestPassRate([srun("a")])).toBeNull();
  });
});

describe("pointsPerToolCall", () => {
  test("total points over total tool calls, exempt excluded", () => {
    // (8+5+6) / (4+6+5) = 19/15
    expect(pointsPerToolCall(FIXTURE)).toBeCloseTo(19 / 15, 5);
  });
  test("null when no tool calls", () => {
    expect(pointsPerToolCall([srun("a", { toolCallCount: 0 })])).toBeNull();
  });
});

describe("timeCostSlice", () => {
  test("aggregates wall time and tokens, exempt excluded", () => {
    const slice = timeCostSlice(FIXTURE);
    // wall: 2000+4000+3000 = 9000ms
    expect(slice.totalWallSeconds).toBeCloseTo(9, 5);
    expect(slice.avgScenarioSeconds).toBeCloseTo(3, 5);
    // tokens: 300+150 = 450
    expect(slice.totalTokens).toBe(450);
    // completionTps: (200+100) / ((1000+1000)/1000) = 300/2 = 150
    expect(slice.completionTps).toBeCloseTo(150, 5);
  });
});

describe("dimensionAverages", () => {
  test("averages per-dimension scores from evaluations", () => {
    const rows = [
      srun("a", {
        evaluation: {
          status: "pass",
          points: 10,
          maxPoints: 10,
          checks: [],
          summary: "",
          correctness: 4,
          scope: 2,
        } as never,
      }),
      srun("b", {
        evaluation: {
          status: "partial",
          points: 5,
          maxPoints: 10,
          checks: [],
          summary: "",
          correctness: 2,
        } as never,
      }),
      srun("exempt", { maxPoints: 0, evaluation: { correctness: 999 } as never }),
    ];
    const avg = dimensionAverages(rows);
    expect(avg.correctness).toBeCloseTo(3, 5);
    expect(avg.scope).toBeCloseTo(2, 5);
    expect(avg.pattern).toBeNull();
  });
});
