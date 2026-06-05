import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-45-tsc-api-upgrade.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;
const TSC = "bunx tsc --noEmit -p playground/sb45-apichange/tsconfig.json";

const goldToolCalls: ToolCall[] = [
  {
    name: "bash",
    args: JSON.stringify({ command: TSC }),
    turn: 0,
    result: { ok: false, message: "exit_code: 2\napp.ts(8,43): error TS2554" },
  },
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/sb45-apichange/src/app.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 1,
  },
  {
    name: "bash",
    args: JSON.stringify({ command: TSC }),
    turn: 2,
    result: { ok: true, value: "exit_code: 0\n" },
  },
];

// Plausible wrong attempt: silences the errors with `as any` / `@ts-ignore`
// instead of migrating, and never runs tsc.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/sb45-apichange/src/app.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 0,
  },
];

test("SB-45 tsc-api-upgrade gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-45", "gold"),
    brokenDir: join(here, "SB-45", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
