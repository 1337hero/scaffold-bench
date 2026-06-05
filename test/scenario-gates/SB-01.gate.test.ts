import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-01-fix-throttle.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-01 fix-throttle gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-01", "gold"),
    brokenDir: join(here, "SB-01", "broken"),
    goldToolCalls: readThenEdit(["playground/utils.js"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
