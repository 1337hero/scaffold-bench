import { expect, it } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-41-liquid-soldout.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const TEMPLATE = "liquid-shop/sections/featured-grid.liquid";

it("SB-41 liquid-soldout gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-41", "gold"),
    brokenDir: join(here, "SB-41", "broken"),
    goldToolCalls: readThenEdit([TEMPLATE]),
    brokenToolCalls: readThenEdit([TEMPLATE]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
