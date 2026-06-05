import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-46-hono-reuse-abstractions.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/stats-reuse-abstractions.md" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/stats.ts", content: "" }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 2,
  },
];

// Plausible wrong attempt: reimplements auth inline (sessions query + cookie),
// redeclares its own DB type, and counts ALL items (no per-user / deleted
// filter).
const brokenToolCalls: ToolCall[] = [
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/stats.ts", content: "" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 1,
  },
];

test("SB-46 hono-reuse-abstractions gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-46", "gold"),
    brokenDir: join(here, "SB-46", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
