import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-25-tanstack-router-loader-ownership.ts";
import { evaluateReference, readThenEdit } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const toolCalls: ToolCall[] = [
  { name: "grep", args: JSON.stringify({ pattern: "fetchProjects" }), turn: 0 },
  ...readThenEdit([
    "playground/tanstack-router-app/src/routes/projects.tsx",
    "playground/tanstack-router-app/src/components/ProjectsTable.tsx",
  ]).map((call) => Object.assign(call, { turn: call.turn + 1 })),
];

test("SB-25 gold: multi-line loader + presentational table scores full marks", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-25", "gold"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBe(3);
  expect(evaluation.points).toBeGreaterThanOrEqual(9);
});

test("SB-25 broken: table still fetching via useQuery caps correctness at the loader point", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-25", "broken"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBeLessThanOrEqual(1);
});
