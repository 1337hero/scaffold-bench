import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-23-express-middleware-order.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-23 express-middleware-order gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-23", "gold"),
    brokenDir: join(here, "SB-23", "broken"),
    goldToolCalls: readThenEdit(["playground/express-api/src/server.ts"]),
    brokenToolCalls: readThenEdit([
      "playground/express-api/src/server.ts",
      "playground/express-api/src/logger.ts",
    ]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
}, 60_000);
