import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-39-hono-typed-validation.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/typed-validation-errors.md" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/users.ts", old_str: "", new_str: "" }),
    turn: 1,
  },
];

// Plausible wrong attempt: hand-rolls the checks, returns a generic 400 via
// AppError instead of the typed 422 field map, leaves debug logging.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/users.ts", old_str: "", new_str: "" }),
    turn: 0,
  },
];

test("SB-39 hono-typed-validation gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-39", "gold"),
    brokenDir: join(here, "SB-39", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
