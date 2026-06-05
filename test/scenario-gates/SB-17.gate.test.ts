import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-17-hono-soft-delete-restore.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/soft-delete-restore.md" }),
    turn: 0,
  },
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/items.ts" }),
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

// Broken: skipped the spec, no 409/not_deleted, dropped DELETE handler.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/hono-api/src/routes/items.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 0,
  },
];

test("SB-17 hono-soft-delete-restore gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-17", "gold"),
    brokenDir: join(here, "SB-17", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
