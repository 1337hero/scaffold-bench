import { test, expect } from "bun:test";
import { join } from "node:path";
import scenario from "../../lib/scenarios/SB-24-react-hook-form-zod-resolver.ts";
import { evaluateReference, readThenEdit } from "./_harness.ts";
import type { ToolCall } from "../../lib/scoring.ts";

const here = import.meta.dir;

const toolCalls: ToolCall[] = [
  { name: "grep", args: JSON.stringify({ pattern: "signupSchema" }), turn: 0 },
  ...readThenEdit(["playground/frontend/SignupForm.tsx"]).map((call) =>
    Object.assign(call, { turn: call.turn + 1 })
  ),
];

test("SB-24 gold: resolver wired via zodResolver scores full marks", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-24", "gold"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBe(3);
  expect(evaluation.points).toBeGreaterThanOrEqual(9);
});

test("SB-24 broken: resolver tokens in a comment earn no correctness", async () => {
  const evaluation = await evaluateReference({
    scenario,
    referenceDir: join(here, "SB-24", "broken"),
    toolCalls,
  });

  expect(evaluation.rubricBreakdown?.correctness).toBe(0);
});
