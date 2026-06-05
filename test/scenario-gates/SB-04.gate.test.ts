import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-04-frontend-scope-discipline.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-04 frontend-scope-discipline gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-04", "gold"),
    brokenDir: join(here, "SB-04", "broken"),
    goldToolCalls: readThenEdit(["playground/frontend/OrdersPanel.tsx"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
