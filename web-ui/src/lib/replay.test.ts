import { describe, expect, test } from "bun:test";
import { coalesceReplayDeltas, normalizeStoredRunEvents } from "./replay";
import type { PersistedEvent } from "../types";

const base = { runId: "run-1", scenarioId: "SB-01" };

describe("replay event utilities", () => {
  test("normalizes stored run events and sorts by seq", () => {
    const events = normalizeStoredRunEvents([
      {
        seq: 2,
        ts: 20,
        type: "assistant_delta",
        payload: { seq: 99, ts: 99, type: "assistant_delta", ...base, content: "b" },
      },
      {
        seq: 1,
        ts: 10,
        type: "scenario_started",
        payload: { seq: 99, ts: 99, type: "scenario_started", ...base, category: "cat", maxPoints: 2 },
      },
    ]);

    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events[0].type).toBe("scenario_started");
  });

  test("coalesces adjacent assistant deltas for the same scenario", () => {
    const input: PersistedEvent[] = [
      { seq: 1, ts: 10, type: "assistant_delta", ...base, content: "hel" },
      { seq: 2, ts: 20, type: "assistant_delta", ...base, content: "lo" },
      { seq: 3, ts: 30, type: "tool_call", ...base, call: { name: "bash", args: "{}", turn: 0 } },
    ];

    const out = coalesceReplayDeltas(input);

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "assistant_delta", seq: 2, content: "hello" });
    expect(out[1].type).toBe("tool_call");
  });

  test("does not coalesce deltas across scenarios", () => {
    const input: PersistedEvent[] = [
      { seq: 1, ts: 10, type: "assistant_delta", ...base, content: "a" },
      { seq: 2, ts: 20, type: "assistant_delta", runId: "run-1", scenarioId: "SB-02", content: "b" },
    ];

    const out = coalesceReplayDeltas(input);

    expect(out).toHaveLength(2);
    expect(out.map((e) => e.type === "assistant_delta" ? e.content : "")).toEqual(["a", "b"]);
  });
});
