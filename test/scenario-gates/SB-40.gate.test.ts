import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-40-hono-catalog-pagination.ts";
import { assertGate } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const goldToolCalls: ToolCall[] = [
  {
    name: "read",
    args: JSON.stringify({ path: "playground/hono-api/specs/catalog-list.md" }),
    turn: 0,
  },
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/catalog.ts", content: "" }),
    turn: 1,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/index.ts", old_str: "", new_str: "" }),
    turn: 2,
  },
];

// Plausible wrong attempt: skips the spec, OFFSET paging that overlaps, counts
// every user's items, reinvents auth — and also tweaks an unrelated file.
const brokenToolCalls: ToolCall[] = [
  {
    name: "write",
    args: JSON.stringify({ path: "playground/hono-api/src/routes/catalog.ts", content: "" }),
    turn: 0,
  },
  {
    name: "edit",
    args: JSON.stringify({ path: "playground/hono-api/src/db.ts", old_str: "", new_str: "" }),
    turn: 1,
  },
];

test("SB-40 hono-catalog-pagination gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-40", "gold"),
    brokenDir: join(here, "SB-40", "broken"),
    goldToolCalls,
    brokenToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
