import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-29-route-action-ownership.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-29 route-action-ownership gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-29", "gold"),
    brokenDir: join(here, "SB-29", "broken"),
    goldToolCalls: readThenEdit(["playground/sb29-route-action/src/projectAction.ts"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
