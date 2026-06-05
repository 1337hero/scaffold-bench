import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-22-nextjs-server-client-boundary.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-22 nextjs-server-client-boundary gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-22", "gold"),
    brokenDir: join(here, "SB-22", "broken"),
    goldToolCalls: readThenEdit([
      "playground/nextjs-app/app/dashboard/DashboardFilters.tsx",
    ]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
