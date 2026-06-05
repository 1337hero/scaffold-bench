import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-31-view-state-precedence.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-31 view-state-precedence gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-31", "gold"),
    brokenDir: join(here, "SB-31", "broken"),
    goldToolCalls: readThenEdit(["playground/sb31-view-state/viewState.ts"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
