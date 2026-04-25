import { describe, expect, test } from "bun:test";
import { reducer, INITIAL_REDUCER_STATE } from "./run-state-reducer";
import type { Action } from "./run-state-reducer";
import type { PersistedEvent, ScenarioEvaluation } from "../types";
import {
  getCategoryRollups,
  getDisplayedPoints,
  getLivePoints,
  isRunComplete,
} from "../views/dashboard-selectors";

function play(events: Action[]) {
  return events.reduce((s, e) => reducer(s, e), INITIAL_REDUCER_STATE);
}

const runId = "run-flow";

const passEval: ScenarioEvaluation = {
  status: "pass",
  points: 10,
  maxPoints: 10,
  checks: [{ name: "files-changed", pass: true }],
  summary: "ok",
};

const failEval: ScenarioEvaluation = {
  status: "fail",
  points: 0,
  maxPoints: 10,
  checks: [{ name: "files-changed", pass: false, detail: "no diff" }],
  summary: "no diff",
};

describe("event-flow: realistic two-scenario run", () => {
  const events: PersistedEvent[] = [
    {
      seq: 1,
      ts: 1_000,
      type: "run_started",
      runId,
      scenarioIds: ["SB-01", "SB-02"],
      model: "qwen3-coder",
      endpoint: null,
    },
    {
      seq: 2,
      ts: 1_100,
      type: "scenario_started",
      runId,
      scenarioId: "SB-01",
      name: "Alpha",
      category: "core",
      maxPoints: 10,
    },
    { seq: 3, ts: 1_150, type: "assistant_delta", runId, scenarioId: "SB-01", content: "look" },
    { seq: 4, ts: 1_200, type: "assistant_delta", runId, scenarioId: "SB-01", content: "ing" },
    {
      seq: 5,
      ts: 1_250,
      type: "tool_call",
      runId,
      scenarioId: "SB-01",
      call: { name: "bash", args: JSON.stringify({ command: "ls" }), turn: 0 },
    },
    {
      seq: 6,
      ts: 1_260,
      type: "tool_result",
      runId,
      scenarioId: "SB-01",
      call: { name: "bash", args: "{}", turn: 0 },
      result: "file.ts\n",
    },
    { seq: 7, ts: 1_300, type: "assistant_delta", runId, scenarioId: "SB-01", content: "patching" },
    {
      seq: 8,
      ts: 1_350,
      type: "tool_call",
      runId,
      scenarioId: "SB-01",
      call: { name: "write", args: JSON.stringify({ path: "file.ts" }), turn: 1 },
    },
    {
      seq: 9,
      ts: 1_360,
      type: "tool_result",
      runId,
      scenarioId: "SB-01",
      call: { name: "write", args: "{}", turn: 1 },
      result: "ok",
    },
    {
      seq: 10,
      ts: 1_400,
      type: "model_metrics",
      runId,
      scenarioId: "SB-01",
      metrics: {
        model: "qwen3-coder",
        requestCount: 2,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        totalRequestTimeMs: 600,
      },
    },
    {
      seq: 11,
      ts: 1_450,
      type: "scenario_finished",
      runId,
      scenarioId: "SB-01",
      status: "pass",
      points: 10,
      wallTimeMs: 350,
      toolCallCount: 2,
      evaluation: passEval,
    },
    {
      seq: 12,
      ts: 1_500,
      type: "scenario_started",
      runId,
      scenarioId: "SB-02",
      name: "Beta",
      category: "edge",
      maxPoints: 10,
    },
    { seq: 13, ts: 1_550, type: "assistant_delta", runId, scenarioId: "SB-02", content: "stuck" },
    {
      seq: 14,
      ts: 1_650,
      type: "scenario_finished",
      runId,
      scenarioId: "SB-02",
      status: "fail",
      points: 0,
      wallTimeMs: 150,
      toolCallCount: 0,
      evaluation: failEval,
    },
    {
      seq: 15,
      ts: 1_700,
      type: "run_finished",
      runId,
      totalPoints: 10,
      maxPoints: 20,
      reportPath: null,
    },
  ];

  const final = play(events);

  test("run terminal state is done with persisted totals", () => {
    expect(final.runId).toBe(runId);
    expect(final.status).toBe("done");
    expect(final.totalPoints).toBe(10);
    expect(final.maxPoints).toBe(20);
    expect(isRunComplete(final.status)).toBe(true);
  });

  test("active scenario clears after the last scenario finishes", () => {
    expect(final.activeScenarioId).toBeNull();
  });

  test("first scenario captures full transcript across deltas, tool calls, and the final flush", () => {
    const sb01 = final.scenarios.find((s) => s.id === "SB-01")!;
    expect(sb01.status).toBe("pass");
    expect(sb01.points).toBe(10);
    expect(sb01.streamBuffer).toBe("");

    const labels = sb01.logs.map((l) => l.label);
    expect(labels).toEqual(["assistant", "cmd", "stdout", "assistant", "edit", "stdout"]);
    expect(sb01.logs[0].text).toBe("looking");
    expect(sb01.logs[1].text).toBe("$ ls");
    expect(sb01.logs[3].text).toBe("patching");
  });

  test("tool counts split between bash and edit", () => {
    const sb01 = final.scenarios.find((s) => s.id === "SB-01")!;
    expect(sb01.toolCallCount).toBe(2);
    expect(sb01.bashCallCount).toBe(1);
    expect(sb01.editCallCount).toBe(1);
  });

  test("failing scenario keeps its evaluation but flushes its trailing buffer", () => {
    const sb02 = final.scenarios.find((s) => s.id === "SB-02")!;
    expect(sb02.status).toBe("fail");
    expect(sb02.points).toBe(0);
    expect(sb02.evaluation).toEqual(failEval);
    expect(sb02.streamBuffer).toBe("");
    expect(sb02.logs.map((l) => l.text)).toEqual(["stuck"]);
  });

  test("log ids are globally unique and monotonic across both scenarios", () => {
    const allIds = final.scenarios.flatMap((s) => s.logs.map((l) => l.id));
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toEqual(allIds.toSorted((a, b) => a - b));
  });

  test("category rollups match the per-scenario outcomes", () => {
    const rollups = Object.fromEntries(getCategoryRollups(final).map((r) => [r.category, r]));
    expect(rollups.core).toEqual({ category: "core", points: 10, maxPoints: 10 });
    expect(rollups.edge).toEqual({ category: "edge", points: 0, maxPoints: 10 });
  });

  test("displayed points pin to persisted totals once run is done", () => {
    expect(getDisplayedPoints(final)).toEqual({ total: 10, max: 20 });
    expect(getLivePoints(final)).toEqual({ total: 10, max: 20 });
  });
});

describe("event-flow: out-of-order arrivals don't poison state", () => {
  test("delta for an unknown scenario is silently ignored", () => {
    const final = play([
      {
        seq: 1,
        ts: 1_000,
        type: "run_started",
        runId,
        scenarioIds: ["SB-01"],
        model: null,
        endpoint: null,
      },
      { seq: 2, ts: 1_100, type: "assistant_delta", runId, scenarioId: "GHOST", content: "x" },
    ]);
    expect(final.scenarios.map((s) => s.streamBuffer)).toEqual([""]);
  });

  test("assistant_delta during pending scenario does not start the scenario", () => {
    const final = play([
      {
        seq: 1,
        ts: 1_000,
        type: "run_started",
        runId,
        scenarioIds: ["SB-01"],
        model: null,
        endpoint: null,
      },
      { seq: 2, ts: 1_100, type: "assistant_delta", runId, scenarioId: "SB-01", content: "early" },
    ]);
    const sb01 = final.scenarios[0];
    expect(sb01.status).toBe("pending");
    expect(sb01.streamBuffer).toBe("early");
    expect(final.activeScenarioId).toBeNull();
  });
});

describe("event-flow: run_stopped mid-stream", () => {
  test("stopping mid-scenario freezes status without flushing buffers", () => {
    const final = play([
      {
        seq: 1,
        ts: 1_000,
        type: "run_started",
        runId,
        scenarioIds: ["SB-01"],
        model: null,
        endpoint: null,
      },
      {
        seq: 2,
        ts: 1_100,
        type: "scenario_started",
        runId,
        scenarioId: "SB-01",
        category: "core",
        maxPoints: 10,
      },
      { seq: 3, ts: 1_200, type: "assistant_delta", runId, scenarioId: "SB-01", content: "midway" },
      { seq: 4, ts: 1_300, type: "run_stopped", runId },
    ]);
    expect(final.status).toBe("stopped");
    expect(isRunComplete(final.status)).toBe(true);
    expect(final.scenarios[0].streamBuffer).toBe("midway");
    expect(final.scenarios[0].status).toBe("running");
  });
});
