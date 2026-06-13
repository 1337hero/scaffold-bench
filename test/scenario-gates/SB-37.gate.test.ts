import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-37-reporting-query.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-37 reporting-query gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-37", "gold"),
    brokenDir: join(here, "SB-37", "broken"),
    goldToolCalls: [
      { name: "read", args: JSON.stringify({ path: "playground/sql-reports/schema.sql" }), turn: 0 },
      { name: "read", args: JSON.stringify({ path: "playground/sql-reports/seed.sql" }), turn: 1 },
      ...readThenEdit(["playground/sql-reports/queries/monthly-net-revenue.sql"]).map((tc) => ({
        ...tc,
        turn: tc.turn + 2,
      })),
    ],
    brokenToolCalls: readThenEdit(["playground/sql-reports/queries/monthly-net-revenue.sql"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
