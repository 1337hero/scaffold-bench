import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-49-cross-subsystem-reuse.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  { name: "read", args: JSON.stringify({ path: "playground/sb49-format/SPEC.md" }), turn: 0 },
  { name: "read", args: JSON.stringify({ path: "playground/sb49-format/src/format.ts" }), turn: 1 },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/sb49-format/src/invoices.ts", old_str: "", new_str: "" }),
    turn: 2,
  },
];

// Plausible wrong attempt: reimplements (redefines) formatMoney inside invoices
// with the wrong non-USD symbol, and also tweaks the shared format.ts.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/sb49-format/src/invoices.ts", old_str: "", new_str: "" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/sb49-format/src/format.ts", old_str: "", new_str: "" }),
    turn: 1,
  },
];

test("SB-49 cross-subsystem-reuse gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-49", "gold"),
    brokenDir: join(here, "SB-49", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
