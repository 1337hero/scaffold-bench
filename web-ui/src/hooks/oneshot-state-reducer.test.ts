import { describe, expect, test } from "bun:test";
import {
  INITIAL_ONESHOT_STATE,
  oneshotStateReducer,
  type OneshotState,
} from "./oneshot-state-reducer";

describe("oneshot-state-reducer", () => {
  test("initial state", () => {
    expect(INITIAL_ONESHOT_STATE.runId).toBeNull();
    expect(INITIAL_ONESHOT_STATE.status).toBe("idle");
    expect(Object.keys(INITIAL_ONESHOT_STATE.prompts)).toHaveLength(0);
  });

  test("oneshot_run_started seeds run", () => {
    const next = oneshotStateReducer(INITIAL_ONESHOT_STATE, {
      type: "oneshot_run_started",
      runId: "r1",
      promptIds: ["p1", "p2"],
      model: "m1",
      seq: 1,
    });

    expect(next.runId).toBe("r1");
    expect(next.status).toBe("running");
    expect(next.prompts.p1.status).toBe("pending");
  });

  test("oneshot_test_started marks prompt running", () => {
    const started = seed();
    const next = oneshotStateReducer(started, {
      type: "oneshot_test_started",
      runId: "r1",
      promptId: "p1",
      index: 0,
      total: 2,
      seq: 2,
    });

    expect(next.prompts.p1.status).toBe("running");
  });

  test("oneshot_delta appends output", () => {
    const started = oneshotStateReducer(seed(), {
      type: "oneshot_test_started",
      runId: "r1",
      promptId: "p1",
      index: 0,
      total: 2,
      seq: 2,
    });

    const next = oneshotStateReducer(started, {
      type: "oneshot_delta",
      runId: "r1",
      promptId: "p1",
      content: "hello",
      seq: 3,
    });

    expect(next.prompts.p1.output).toBe("hello");
  });

  test("oneshot_test_finished stores metrics and marks done", () => {
    const running = oneshotStateReducer(seed(), {
      type: "oneshot_test_started",
      runId: "r1",
      promptId: "p1",
      index: 0,
      total: 2,
      seq: 2,
    });

    const next = oneshotStateReducer(running, {
      type: "oneshot_test_finished",
      runId: "r1",
      promptId: "p1",
      output: "full output",
      metrics: { promptTokens: 10, completionTokens: 20 },
      finishReason: "stop",
      wallTimeMs: 99,
      firstTokenMs: 12,
      seq: 4,
    });

    expect(next.prompts.p1.status).toBe("done");
    expect(next.prompts.p1.output).toBe("full output");
    expect(next.prompts.p1.completionTokens).toBe(20);
  });

  test("oneshot_run_finished marks run done", () => {
    const next = oneshotStateReducer(seed(), {
      type: "oneshot_run_finished",
      runId: "r1",
      seq: 5,
    });

    expect(next.status).toBe("done");
  });

  test("duplicate seq is ignored", () => {
    const once = oneshotStateReducer(seed(), {
      type: "oneshot_run_finished",
      runId: "r1",
      seq: 5,
    });

    const twice = oneshotStateReducer(once, {
      type: "oneshot_run_failed",
      runId: "r1",
      error: "x",
      seq: 5,
    });

    expect(twice.status).toBe("done");
  });

  test("run started resets sequence dedupe for next run", () => {
    const first = oneshotStateReducer(seed(), {
      type: "oneshot_run_finished",
      runId: "r1",
      seq: 5,
    });

    const second = oneshotStateReducer(first, {
      type: "oneshot_run_started",
      runId: "r2",
      promptIds: ["p3"],
      model: "m2",
      seq: 1,
    });

    const resumed = oneshotStateReducer(second, {
      type: "oneshot_test_started",
      runId: "r2",
      promptId: "p3",
      index: 0,
      total: 1,
      seq: 2,
    });

    expect(second.runId).toBe("r2");
    expect(resumed.prompts.p3.status).toBe("running");
  });

  test("oneshot_run_failed marks run failed", () => {
    const next = oneshotStateReducer(seed(), {
      type: "oneshot_run_failed",
      runId: "r1",
      error: "boom",
      seq: 9,
    });

    expect(next.status).toBe("failed");
  });
});

function seed(): OneshotState {
  return oneshotStateReducer(INITIAL_ONESHOT_STATE, {
    type: "oneshot_run_started",
    runId: "r1",
    promptIds: ["p1", "p2"],
    model: "m1",
    seq: 1,
  });
}
