import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-16-hono-audit-log.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/audit-log.md" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/lib/audit.ts", content: "" }),
    turn: 1,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/admin.ts", content: "" }),
    turn: 2,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/schema.sql", old_str: "", new_str: "" }),
    turn: 3,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 4,
  },
];

// Broken: skipped the spec, audit on every path (incl. 400/403), wrong action
// string, no index in schema, stray console.log.
const brokenToolCalls: ToolCall[] = [
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/lib/audit.ts", content: "" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/admin.ts", content: "" }),
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

test("SB-16 hono-audit-log gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-16", "gold"),
    brokenDir: join(here, "SB-16", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
