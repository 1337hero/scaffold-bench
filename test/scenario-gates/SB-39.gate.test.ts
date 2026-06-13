import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-39-dockerfile-layers.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const DOCKERFILE = "playground/ops/Dockerfile";

test("SB-39 dockerfile-layers gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-39", "gold"),
    brokenDir: join(here, "SB-39", "broken"),
    goldToolCalls: readThenEdit([DOCKERFILE]),
    brokenToolCalls: readThenEdit([DOCKERFILE]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
