import { expect, it } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-43-build-a-section.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const NEW_SECTION = "liquid-shop/sections/product-spotlight.liquid";

it("SB-43 build-a-section gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-43", "gold"),
    brokenDir: join(here, "SB-43", "broken"),
    goldToolCalls: readThenEdit([NEW_SECTION]),
    brokenToolCalls: readThenEdit([NEW_SECTION]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
