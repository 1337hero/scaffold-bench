import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-36-migration-backfill.ts";
import { assertGate, bashCall, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-36 migration-backfill gold/broken gate", async () => {
  const migPath = "playground/sql-reports/migrations/002.sql";
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-36", "gold"),
    brokenDir: join(here, "SB-36", "broken"),
    goldToolCalls: [
      ...readThenEdit([migPath]),
      bashCall("bun test playground/sql-reports/migrations/test-migration.ts", 2, 1),
      bashCall("bun test playground/sql-reports/migrations/test-migration.ts", 3, 0),
    ],
    brokenToolCalls: readThenEdit([migPath]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
