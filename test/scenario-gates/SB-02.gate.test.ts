import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-02-frontend-derived-state-fix.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-02 frontend-derived-state-fix gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-02", "gold"),
    brokenDir: join(here, "SB-02", "broken"),
    goldToolCalls: readThenEdit(["playground/frontend/InventoryPanel.tsx"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
