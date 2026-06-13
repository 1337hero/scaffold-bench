import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-35-join-fanout.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-35 join-fanout gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-35", "gold"),
    brokenDir: join(here, "SB-35", "broken"),
    goldToolCalls: readThenEdit(["playground/sql-reports/queries/totals.sql"]),
    brokenToolCalls: readThenEdit(["playground/sql-reports/queries/totals.sql"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
