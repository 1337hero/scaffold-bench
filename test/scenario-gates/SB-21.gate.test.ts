import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-21-axios-ssrf-protocol-relative.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-21 axios-ssrf-protocol-relative gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-21", "gold"),
    brokenDir: join(here, "SB-21", "broken"),
    goldToolCalls: readThenEdit(["playground/sb29-axios-ssrf/isAbsoluteURL.mjs"]),
    brokenToolCalls: readThenEdit([
      "playground/sb29-axios-ssrf/isAbsoluteURL.mjs",
      "playground/sb29-axios-ssrf/note.txt",
    ]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 30_000);
