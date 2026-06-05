import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-43-tsconfig-path-alias.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;
const TSC = "bunx tsc --noEmit -p playground/sb43-paths/tsconfig.json";

const goldToolCalls: ToolCall[] = [
  {
    name: "bash",
    args: JSON.stringify({ command: TSC }),
    turn: 0,
    result: { ok: false, message: "exit_code: 2\nmain.ts(1,28): error TS2307" },
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/sb43-paths/tsconfig.json", old_str: "", new_str: "" }),
    turn: 1,
  },
  {
    name: "bash",
    args: JSON.stringify({ command: TSC }),
    turn: 2,
    result: { ok: true, value: "exit_code: 0\n" },
  },
];

// Plausible wrong attempt: instead of fixing the alias config, rewrites the
// import to a relative path (compiles, but defeats the alias) and never runs tsc.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/sb43-paths/src/main.ts", old_str: "", new_str: "" }),
    turn: 0,
  },
];

test("SB-43 tsconfig-path-alias gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-43", "gold"),
    brokenDir: join(here, "SB-43", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
