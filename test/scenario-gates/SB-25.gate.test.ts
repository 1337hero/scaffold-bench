import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-25-tanstack-router-loader-ownership.ts";
import { assertGate, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;

const edits = readThenEdit([
  "playground/tanstack-router-app/src/routes/projects.tsx",
  "playground/tanstack-router-app/src/components/ProjectsTable.tsx",
]);
for (const call of edits) call.turn += 1;
const goldToolCalls = [
  { name: "grep", args: JSON.stringify({ pattern: "useQuery" }), turn: 0 },
  ...edits,
];

test("SB-25 tanstack-router-loader-ownership gold/broken gate", async () => {
  const result = await assertGate({
    scenario,
    goldDir: join(here, "SB-25", "gold"),
    brokenDir: join(here, "SB-25", "broken"),
    goldToolCalls,
  });

  expect(result.gold).toBeGreaterThanOrEqual(9);
  expect(result.broken).toBeLessThanOrEqual(4);
});
