import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-37-hono-admin-role-guard.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/admin-user-list.md" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/admin.ts", content: "" }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 2,
  },
];

// Plausible wrong attempt: inlines the route into users.ts (wrong file), with an
// inline role check that returns 403 to anonymous callers instead of 401.
const brokenToolCalls: ToolCall[] = [
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/hono-api/src/routes/users.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 0,
  },
];

test("SB-37 hono-admin-role-guard gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-37", "gold"),
    brokenDir: join(here, "SB-37", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
