import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-04-frontend-scope-discipline.ts";
import { evaluateReference, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const toolCalls = readThenEdit(["playground/frontend/OrdersPanel.tsx"]);

test("SB-04 gold: async onSuccess invalidation scores full marks", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-04", "gold"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBe(3);
  expect(evaluation.points).toBeGreaterThanOrEqual(9);
});

test("SB-04 broken: approveOrder invalidating the wrong key earns no correctness", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-04", "broken"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBe(0);
});
