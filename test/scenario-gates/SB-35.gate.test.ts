import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-35-focus-trap.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-35 focus-trap gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-35", "gold"),
    brokenDir: join(here, "SB-35", "broken"),
    goldToolCalls: readThenEdit(["playground/sb35-focus-trap/focusTrap.ts"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
