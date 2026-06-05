import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-41-hono-additive-migration.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/items-priority-migration.md" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/migrations.ts", content: "" }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/db.ts", old_str: "", new_str: "" }),
    turn: 2,
  },
];

// Plausible wrong attempt: edits the frozen schema.sql AND ships a non-idempotent
// migration, so createDb double-adds the column and throws.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/schema.sql", old_str: "", new_str: "" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/migrations.ts", content: "" }),
    turn: 1,
  },
];

test("SB-41 hono-additive-migration gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-41", "gold"),
    brokenDir: join(here, "SB-41", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
