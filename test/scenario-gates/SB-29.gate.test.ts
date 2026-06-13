import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-29-test-isolation.ts";
import { assertGate, bashCall } from "./_harness.ts";

const here = import.meta.dir;

test("SB-29 test-isolation gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-29", "gold"),
    brokenDir: join(here, "SB-29", "broken"),
    goldToolCalls: [
      {
        name: "read",
        args: JSON.stringify({ path: "playground/frontend/cache.test.js" }),
        turn: 0,
      },
      bashCall("bun test playground/frontend/cache.test.js", 1, 1),
      {
        name: "edit",
        args: JSON.stringify({
          path: "playground/frontend/cache.test.js",
          old_str: "",
          new_str: "",
        }),
        turn: 2,
      },
      bashCall("bun test playground/frontend/cache.test.js", 3, 0),
    ],
    brokenToolCalls: [
      {
        name: "read",
        args: JSON.stringify({ path: "playground/frontend/cache.test.js" }),
        turn: 0,
      },
      {
        name: "edit",
        args: JSON.stringify({
          path: "playground/frontend/cache.test.js",
          old_str: "",
          new_str: "",
        }),
        turn: 1,
      },
    ],
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
