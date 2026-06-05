import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-12-typescript-compile-loop.ts";
import { TS_COMPILE_COMMAND } from "../../lib/scenarios/_shared/helpers.ts";
import { assertGate, bashCall } from "./_harness.ts";

const here = import.meta.dir;

test("SB-12 typescript-compile-loop gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-12", "gold"),
    brokenDir: join(here, "SB-12", "broken"),
    goldToolCalls: [
      { name: "read", args: JSON.stringify({ path: "playground/ts-compile/user-summary.ts" }), turn: 0 },
      bashCall(TS_COMPILE_COMMAND, 1, 1),
      {
        name: "edit",
        args: JSON.stringify({
          path: "playground/ts-compile/user-summary.ts",
          old_str: "",
          new_str: "",
        }),
        turn: 2,
      },
      bashCall(TS_COMPILE_COMMAND, 3, 0),
    ],
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
