import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-32-a11y-form-labels.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-32 a11y-form-labels gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-32", "gold"),
    brokenDir: join(here, "SB-32", "broken"),
    goldToolCalls: readThenEdit(["playground/sb32-a11y-labels/searchForm.ts"]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
