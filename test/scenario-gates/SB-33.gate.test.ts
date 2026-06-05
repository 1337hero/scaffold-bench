import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-33-responsive-breakpoints.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-33 responsive-breakpoints gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-33", "gold"),
    brokenDir: join(here, "SB-33", "broken"),
    goldToolCalls: readThenEdit(["playground/sb33-responsive/grid.ts"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
