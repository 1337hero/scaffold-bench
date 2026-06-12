import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-01-fix-throttle.ts";
import { evaluateReference, readThenEdit } from "./_harness.ts";

const here = import.meta.dir;
const toolCalls = readThenEdit(["playground/utils.js"]);

test("SB-01 gold: working throttle with unconventional identifiers scores full marks", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-01", "gold"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBe(3);
  expect(evaluation.points).toBeGreaterThanOrEqual(9);
});

test("SB-01 broken: debounce clone with throttle-ish identifiers earns no behavioral correctness", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-01", "broken"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBeLessThanOrEqual(1);
});
