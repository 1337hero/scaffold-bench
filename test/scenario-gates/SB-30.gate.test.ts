import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-30-webhook-hmac.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-30 webhook-hmac gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-30", "gold"),
    brokenDir: join(here, "SB-30", "broken"),
    goldToolCalls: [
      {
        name: "read",
        args: JSON.stringify({ path: "playground/hono-api/specs/webhooks.md" }),
        turn: 0,
      },
      ...readThenEdit([
        "playground/hono-api/src/routes/webhooks.ts",
        "playground/hono-api/src/index.ts",
      ]).map((tc) => Object.assign({}, tc, { turn: tc.turn + 1 })),
    ],
    brokenToolCalls: readThenEdit([
      "playground/hono-api/src/routes/webhooks.ts",
      "playground/hono-api/src/index.ts",
    ]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
