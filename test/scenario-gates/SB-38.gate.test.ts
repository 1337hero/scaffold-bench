import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-38-actions-trigger.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const WORKFLOW = "playground/ops/.github/workflows/deploy.yml";

test("SB-38 actions-trigger gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-38", "gold"),
    brokenDir: join(here, "SB-38", "broken"),
    goldToolCalls: readThenEdit([WORKFLOW]),
    brokenToolCalls: readThenEdit([WORKFLOW]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
