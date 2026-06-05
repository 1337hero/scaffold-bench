import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-42-tsc-strict-fix.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;
const TSC = "bunx tsc --noEmit -p playground/sb42-strict/tsconfig.json";

// Gold: verified the failure, edited, re-ran and it passed.
const goldToolCalls: ToolCall[] = [
  {
    name: "bash",
    args: JSON.stringify({ command: TSC }),
    turn: 0,
    result: { ok: false, message: "exit_code: 2\nprices.ts(18,15): error TS18048" },
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/sb42-strict/prices.ts", old_str: "", new_str: "" }),
    turn: 1,
  },
  {
    name: "bash",
    args: JSON.stringify({ command: TSC }),
    turn: 2,
    result: { ok: true, value: "exit_code: 0\n" },
  },
];

// Plausible wrong attempt: silenced the errors with non-null assertions, never
// ran tsc, left a stray comment.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/sb42-strict/prices.ts", old_str: "", new_str: "" }),
    turn: 0,
  },
];

test("SB-42 tsc-strict-fix gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-42", "gold"),
    brokenDir: join(here, "SB-42", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
