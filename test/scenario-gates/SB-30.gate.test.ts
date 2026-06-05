import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-30-next-client-server-boundary.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-30 next-client-server-boundary gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-30", "gold"),
    brokenDir: join(here, "SB-30", "broken"),
    goldToolCalls: readThenEdit(["playground/sb30-next-boundary/app/UserMenu.tsx"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
