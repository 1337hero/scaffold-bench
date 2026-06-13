import { test, expect, it } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-40-deploy-script-exclude.ts";
import { assertGate, readThenEdit } from "./_harness.ts";
import { hasTool } from "../../lib/scenarios/_shared/toolchain.ts";

const here = import.meta.dir;
const DEPLOY = "playground/ops/deploy.sh";

it.skipIf(!hasTool("shellcheck"))("SB-40 deploy-script-exclude gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-40", "gold"),
    brokenDir: join(here, "SB-40", "broken"),
    goldToolCalls: readThenEdit([DEPLOY]),
    brokenToolCalls: readThenEdit([DEPLOY]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
