import { expect, it } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-44-nav-stacking.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const MAIN_CSS = "css-ui/styles/main.css";

it("SB-44 nav-stacking gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-44", "gold"),
    brokenDir: join(here, "SB-44", "broken"),
    goldToolCalls: readThenEdit([MAIN_CSS]),
    brokenToolCalls: readThenEdit([MAIN_CSS]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
