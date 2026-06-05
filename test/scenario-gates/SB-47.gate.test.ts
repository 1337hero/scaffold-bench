import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-47-hono-cross-subsystem-error-id.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/error-request-id.md" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/hono-api/src/lib/errors.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 1,
  },
];

// Plausible wrong attempt: flattens the AppError branch (drops the `error`
// wrapper, breaking error.code for every subsystem) and forgets the 500 branch.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/hono-api/src/lib/errors.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 0,
  },
];

test("SB-47 hono-cross-subsystem-error-id gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-47", "gold"),
    brokenDir: join(here, "SB-47", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
