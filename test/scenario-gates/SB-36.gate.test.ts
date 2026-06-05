import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-36-hono-session-invalidation.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/session-invalidation.md" }),
    turn: 0,
  },
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/users.ts" }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/users.ts", old_str: "", new_str: "" }),
    turn: 2,
  },
];

// A plausible wrong attempt: skips the spec, revokes ALL sessions (logs the
// requesting user out too), adds a debug console.log.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/users.ts", old_str: "", new_str: "" }),
    turn: 0,
  },
];

test("SB-36 hono-session-invalidation gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-36", "gold"),
    brokenDir: join(here, "SB-36", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
