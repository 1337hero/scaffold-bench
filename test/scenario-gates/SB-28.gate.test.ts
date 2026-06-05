import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-28-query-stale-refetch.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-28 query-stale-refetch gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-28", "gold"),
    brokenDir: join(here, "SB-28", "broken"),
    goldToolCalls: readThenEdit(["playground/sb28-query-cache/queryCache.ts"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
