import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-44-hono-cors-csrf.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/cors-csrf-hardening.md" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/lib/security.ts", content: "" }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 2,
  },
  {
    name: "edit",
    args: JSON.stringify({
      path: "playground/hono-api/src/lib/errors.ts",
      old_str: "",
      new_str: "",
    }),
    turn: 3,
  },
];

// Plausible wrong attempt: skips the spec, hand-rolls CORS that reflects any
// origin, ships a no-op CSRF, and edits an unrelated route.
const brokenToolCalls: ToolCall[] = [
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/lib/security.ts", content: "" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/db.ts", old_str: "", new_str: "" }),
    turn: 1,
  },
];

test("SB-44 hono-cors-csrf gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-44", "gold"),
    brokenDir: join(here, "SB-44", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
