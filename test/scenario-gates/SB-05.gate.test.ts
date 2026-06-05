import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-05-frontend-stack-loyalty.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-05 frontend-stack-loyalty gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-05", "gold"),
    brokenDir: join(here, "SB-05", "broken"),
    goldToolCalls: readThenEdit(["playground/frontend/ActivityFeed.tsx"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
