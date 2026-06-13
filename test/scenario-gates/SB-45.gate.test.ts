import { expect, it } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-45-theme-variable-scope.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const THEME_CSS = "css-ui/styles/theme.css";
const MAIN_CSS = "css-ui/styles/main.css";

it("SB-45 theme-variable-scope gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-45", "gold"),
    brokenDir: join(here, "SB-45", "broken"),
    goldToolCalls: readThenEdit([THEME_CSS, MAIN_CSS]),
    brokenToolCalls: readThenEdit([THEME_CSS, MAIN_CSS]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
