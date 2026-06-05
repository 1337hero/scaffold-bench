import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-03-frontend-query-owner.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

test("SB-03 frontend-query-owner gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-03", "gold"),
    brokenDir: join(here, "SB-03", "broken"),
    goldToolCalls: readThenEdit([
      "playground/frontend/UsersPage.tsx",
      "playground/frontend/UserTable.tsx",
    ]),
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
