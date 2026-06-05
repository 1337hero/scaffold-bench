import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-18-hono-fix-n-plus-1.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/fix-n-plus-1.md" }),
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

test("SB-18 hono-fix-n-plus-1 gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-18", "gold"),
    brokenDir: join(here, "SB-18", "broken"),
    goldToolCalls,
    brokenToolCalls: goldToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
