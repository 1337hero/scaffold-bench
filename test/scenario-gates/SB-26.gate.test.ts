import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-26-zustand-store-mutation.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-26 zustand-store-mutation gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-26", "gold"),
    brokenDir: join(here, "SB-26", "broken"),
    goldToolCalls: readThenEdit(["playground/frontend/store.js"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
