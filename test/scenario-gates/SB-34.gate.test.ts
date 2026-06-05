import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-34-component-extraction.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-34 component-extraction gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-34", "gold"),
    brokenDir: join(here, "SB-34", "broken"),
    goldToolCalls: readThenEdit([
      "playground/sb34-extract/priceTag.ts",
      "playground/sb34-extract/formatDiscount.ts",
    ]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
