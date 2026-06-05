import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-27-optimistic-rollback.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-27 optimistic-rollback gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-27", "gold"),
    brokenDir: join(here, "SB-27", "broken"),
    goldToolCalls: readThenEdit(["playground/sb27-optimistic-like/likeStore.ts"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
