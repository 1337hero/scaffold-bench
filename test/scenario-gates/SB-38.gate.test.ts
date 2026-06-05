import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-38-hono-idempotent-create.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/idempotent-create-item.md" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/schema.sql", old_str: "", new_str: "" }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/hono-api/src/routes/items.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 2,
  },
];

// Plausible wrong attempt: skips the spec, makes the idempotency key GLOBAL
// (PRIMARY KEY (key) instead of per-user), returns 201 on replay, leaves debug
// logging and a stray comment.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/schema.sql", old_str: "", new_str: "" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/hono-api/src/routes/items.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 1,
  },
];

test("SB-38 hono-idempotent-create gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-38", "gold"),
    brokenDir: join(here, "SB-38", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
