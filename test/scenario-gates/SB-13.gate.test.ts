import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-13-iterate-to-green.ts";
import { assertGate, bashCall } from "./_harness.ts";

const here = import.meta.dir;
const TEST_CMD = "bun test normalizeTag.test.mjs";

test("SB-13 iterate-to-green gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-13", "gold"),
    brokenDir: join(here, "SB-13", "broken"),
    goldToolCalls: [
      { name: "read", args: JSON.stringify({ path: "playground/normalizeTag.mjs" }), turn: 0 },
      bashCall(TEST_CMD, 1, 1),
      {
        name: "edit",
        args: JSON.stringify({ path: "playground/normalizeTag.mjs", old_str: "", new_str: "" }),
        turn: 2,
      },
      bashCall(TEST_CMD, 3, 1),
      {
        name: "edit",
        args: JSON.stringify({ path: "playground/normalizeTag.mjs", old_str: "", new_str: "" }),
        turn: 4,
      },
      bashCall(TEST_CMD, 5, 0),
    ],
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
