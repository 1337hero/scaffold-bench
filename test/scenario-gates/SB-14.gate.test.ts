import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-14-hono-admin-password-reset.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/admin-password-reset.md" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({
      path: "playground/hono-api/src/routes/password-resets.ts",
      content: "",
    }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/schema.sql", old_str: "", new_str: "" }),
    turn: 2,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 3,
  },
];

// Broken: skipped the spec, no schema table, missing expiry/used/session
// invalidation, only one router mounted.
const brokenToolCalls: ToolCall[] = [
  {
    name: "write",
    args: JSON.stringify({
      path: "playground/hono-api/src/routes/password-resets.ts",
      content: "",
    }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 1,
  },
];

test("SB-14 hono-admin-password-reset gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-14", "gold"),
    brokenDir: join(here, "SB-14", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
