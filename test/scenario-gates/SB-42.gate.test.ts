import { expect, it } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-42-astro-frontmatter-field.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const CONFIG = "astro-site/src/content.config.ts";
const SLUG = "astro-site/src/pages/blog/[slug].astro";

it("SB-42 astro-frontmatter-field gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-42", "gold"),
    brokenDir: join(here, "SB-42", "broken"),
    goldToolCalls: readThenEdit([CONFIG, SLUG]),
    brokenToolCalls: readThenEdit([CONFIG, SLUG]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
