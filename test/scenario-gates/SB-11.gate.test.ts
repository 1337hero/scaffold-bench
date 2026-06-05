import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-11-verify-fail-recover-pass.ts";
import { assertGate, bashCall } from "./_harness.ts";

const here = import.meta.dir;

test("SB-11 verify-fail-recover-pass gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-11", "gold"),
    brokenDir: join(here, "SB-11", "broken"),
    goldToolCalls: [
      { name: "read", args: JSON.stringify({ path: "playground/slugify.mjs" }), turn: 0 },
      bashCall("bun test slugify.test.mjs", 1, 1),
      {
        name: "edit",
        args: JSON.stringify({ path: "playground/slugify.mjs", old_str: "", new_str: "" }),
        turn: 2,
      },
      bashCall("bun test slugify.test.mjs", 3, 0),
    ],
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
