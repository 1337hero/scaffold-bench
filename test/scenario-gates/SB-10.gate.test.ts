import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-10-verify-and-repair.ts";
import { assertGate, bashCall, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-10 verify-and-repair gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-10", "gold"),
    brokenDir: join(here, "SB-10", "broken"),
    goldToolCalls: [
      ...readThenEdit(["playground/cart.mjs"]),
      bashCall("bun test cart.test.mjs", 2, 0),
    ],
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
