import { describe, expect, test } from "bun:test";
import {
  getFocusedScenario,
  getCategoryRollups,
  getLivePoints,
  getDisplayedPoints,
  getModel,
  getCallCounts,
  isRunComplete,
} from "./dashboard-selectors";
import type { RunState, ScenarioState, ScenarioStatus } from "@/types";

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
