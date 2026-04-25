import { describe, expect, test } from "bun:test";
import { reducer, INITIAL_REDUCER_STATE } from "./run-state-reducer";
import type { ReducerState, Action } from "./run-state-reducer";
import type { PersistedEvent, ScenarioEvaluation, ModelMetrics } from "../types";

const runId = "run-1";
const scenarioId = "SB-01";

function applyAll(actions: Action[], initial: ReducerState = INITIAL_REDUCER_STATE): ReducerState {
  return actions.reduce((s, a) => reducer(s, a), initial);
}

const runStarted: PersistedEvent = {
  seq: 1,
  ts: 1000,
  type: "run_started",
  runId,
  scenarioIds: [scenarioId, "SB-02"],
  model: "test-model",
  endpoint: null,
};

const scenarioStarted: PersistedEvent = {
  seq: 2,
  ts: 1100,
  type: "scenario_started",
  runId,
  scenarioId,
  name: "First",
  category: "cat-a",
  maxPoints: 10,
};

const evaluation: ScenarioEvaluation = {
  status: "pass",
  points: 10,
  maxPoints: 10,
  checks: [],
  summary: "ok",
};

describe("run-state-reducer control actions", () => {
  test("_focus sets focusedScenarioId without mutating scenarios", () => {
    const started = reducer(INITIAL_REDUCER_STATE, runStarted);
    const next = reducer(started, { type: "_focus", id: "SB-02" });
    expect(next.focusedScenarioId).toBe("SB-02");
    expect(next.scenarios).toBe(started.scenarios);
  });

  test("_reset returns to INITIAL_REDUCER_STATE", () => {
    const s1 = applyAll([runStarted, scenarioStarted]);
    const s2 = reducer(s1, { type: "_reset" });
    expect(s2).toEqual(INITIAL_REDUCER_STATE);
  });
});

describe("run-state-reducer run lifecycle", () => {
  test("run_started populates scenarios as pending", () => {
    const s = reducer(INITIAL_REDUCER_STATE, runStarted);
    expect(s.runId).toBe(runId);
    expect(s.status).toBe("running");
    expect(s.startedAt).toBe(1000);
    expect(s.scenarios).toHaveLength(2);
    expect(s.scenarios[0]).toMatchObject({ id: scenarioId, status: "pending", toolCallCount: 0 });
  });

  test("scenario_started preserves manual focus on a different scenario", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, { type: "_focus", id: "SB-02" });
    const next: PersistedEvent = {
      ...scenarioStarted,
      seq: 3,
      ts: 1200,
      scenarioId: "SB-02",
      name: "Second",
      category: "cat-b",
      maxPoints: 5,
    };
    const after = reducer(s, next);
    expect(after.activeScenarioId).toBe("SB-02");
    expect(after.focusedScenarioId).toBe("SB-02");
  });

  test("scenario_started keeps manual focus when user focused another scenario", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, { type: "_focus", id: "SB-02" });
    const next: PersistedEvent = {
      seq: 3,
      ts: 1200,
      type: "scenario_started",
      runId,
      scenarioId,
      category: "cat-a",
      maxPoints: 10,
    };
    const after = reducer(s, next);
    expect(after.activeScenarioId).toBe(scenarioId);
    expect(after.focusedScenarioId).toBe("SB-02");
  });

  test("run_finished/run_stopped/run_failed set status", () => {
    const s = applyAll([runStarted]);
    expect(
      reducer(s, {
        seq: 9,
        ts: 2000,
        type: "run_finished",
        runId,
        totalPoints: 5,
        maxPoints: 10,
        reportPath: null,
      }).status
    ).toBe("done");
    expect(reducer(s, { seq: 9, ts: 2000, type: "run_stopped", runId }).status).toBe("stopped");
    expect(reducer(s, { seq: 9, ts: 2000, type: "run_failed", runId, error: "x" }).status).toBe(
      "failed"
    );
  });
});

describe("run-state-reducer scenario events", () => {
  test("assistant_delta buffers text and sets firstTokenMs on first non-empty delta", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, {
      seq: 3,
      ts: 1100,
      type: "assistant_delta",
      runId,
      scenarioId,
      content: "   ",
    });
    expect(s.scenarios[0].firstTokenMs).toBeUndefined();
    expect(s.scenarios[0].streamBuffer).toBe("   ");
    s = reducer(s, { seq: 4, ts: 1300, type: "assistant_delta", runId, scenarioId, content: "hi" });
    expect(s.scenarios[0].streamBuffer).toBe("   hi");
    expect(s.scenarios[0].firstTokenMs).toBe(200);
  });

  test("assistant flushes streamBuffer (not event.content) when buffer present", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, {
      seq: 3,
      ts: 1200,
      type: "assistant_delta",
      runId,
      scenarioId,
      content: "buffered",
    });
    s = reducer(s, { seq: 4, ts: 1300, type: "assistant", runId, scenarioId, content: "ignored" });
    expect(s.scenarios[0].streamBuffer).toBe("");
    expect(s.scenarios[0].logs).toHaveLength(1);
    expect(s.scenarios[0].logs[0]).toMatchObject({ kind: "assistant", text: "buffered" });
  });

  test("scenario_finished flushes buffer into a final assistant entry and updates evaluation", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, {
      seq: 3,
      ts: 1200,
      type: "assistant_delta",
      runId,
      scenarioId,
      content: "final",
    });
    s = reducer(s, {
      seq: 4,
      ts: 1400,
      type: "scenario_finished",
      runId,
      scenarioId,
      status: "pass",
      points: 10,
      wallTimeMs: 300,
      toolCallCount: 0,
      evaluation,
    });
    const sc = s.scenarios[0];
    expect(sc.status).toBe("pass");
    expect(sc.points).toBe(10);
    expect(sc.evaluation).toEqual(evaluation);
    expect(sc.streamBuffer).toBe("");
    expect(sc.logs).toHaveLength(1);
    expect(sc.logs[0].text).toBe("final");
  });

  test("tool_call with bash args flushes buffer, adds cmd entry, bumps counts", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, {
      seq: 3,
      ts: 1200,
      type: "assistant_delta",
      runId,
      scenarioId,
      content: "thinking",
    });
    s = reducer(s, {
      seq: 4,
      ts: 1300,
      type: "tool_call",
      runId,
      scenarioId,
      call: { name: "bash", args: JSON.stringify({ command: "ls -la" }), turn: 0 },
    });
    const sc = s.scenarios[0];
    expect(sc.toolCallCount).toBe(1);
    expect(sc.bashCallCount).toBe(1);
    expect(sc.editCallCount).toBe(0);
    expect(sc.logs).toHaveLength(2);
    expect(sc.logs[0]).toMatchObject({ kind: "assistant", text: "thinking" });
    expect(sc.logs[1]).toMatchObject({ kind: "tool", label: "cmd", text: "$ ls -la" });
  });

  test("tool_call with edit tool uses edit label and bumps editCallCount", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, {
      seq: 3,
      ts: 1300,
      type: "tool_call",
      runId,
      scenarioId,
      call: { name: "write", args: JSON.stringify({ path: "foo.ts" }), turn: 0 },
    });
    const sc = s.scenarios[0];
    expect(sc.editCallCount).toBe(1);
    expect(sc.bashCallCount).toBe(0);
    expect(sc.logs[0]).toMatchObject({ kind: "tool", label: "edit", text: "write foo.ts" });
  });

  test("tool_result maps error prefix to stderr, else stdout", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    const call = { name: "bash", args: "{}", turn: 0 };
    s = reducer(s, {
      seq: 3,
      ts: 1300,
      type: "tool_result",
      runId,
      scenarioId,
      call,
      result: "ok output",
    });
    s = reducer(s, {
      seq: 4,
      ts: 1400,
      type: "tool_result",
      runId,
      scenarioId,
      call,
      result: "Error: boom",
    });
    const logs = s.scenarios[0].logs;
    expect(logs[0].kind).toBe("stdout");
    expect(logs[1].kind).toBe("stderr");
  });

  test("model_metrics populates globalMetrics and scenario liveMetrics", () => {
    const metrics: ModelMetrics = {
      requestCount: 2,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      totalRequestTimeMs: 500,
    };
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, { seq: 3, ts: 1300, type: "model_metrics", runId, scenarioId, metrics });
    expect(s.globalMetrics).toEqual(metrics);
    expect(s.scenarios[0].liveMetrics).toEqual(metrics);
  });
});

describe("run-state-reducer log id counter", () => {
  test("log ids are unique and monotonically increasing across events", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, { seq: 3, ts: 1200, type: "assistant_delta", runId, scenarioId, content: "hi" });
    s = reducer(s, { seq: 4, ts: 1250, type: "assistant", runId, scenarioId, content: "" });
    s = reducer(s, {
      seq: 5,
      ts: 1300,
      type: "tool_call",
      runId,
      scenarioId,
      call: { name: "bash", args: JSON.stringify({ command: "echo" }), turn: 0 },
    });
    s = reducer(s, {
      seq: 6,
      ts: 1310,
      type: "tool_result",
      runId,
      scenarioId,
      call: { name: "bash", args: "{}", turn: 0 },
      result: "done",
    });
    const ids = s.scenarios[0].logs.map((l) => l.id);
    expect(ids).toEqual(ids.toSorted((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("after _reset, ids restart from 1", () => {
    let s = applyAll([runStarted, scenarioStarted]);
    s = reducer(s, { seq: 3, ts: 1200, type: "assistant", runId, scenarioId, content: "first" });
    expect(s.scenarios[0].logs[0].id).toBe(1);
    s = reducer(s, { type: "_reset" });
    s = applyAll([runStarted, scenarioStarted], s);
    s = reducer(s, { seq: 3, ts: 1200, type: "assistant", runId, scenarioId, content: "again" });
    expect(s.scenarios[0].logs[0].id).toBe(1);
  });
});
