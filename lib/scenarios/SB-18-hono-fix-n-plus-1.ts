import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput, ScenarioEvaluation } from "../scoring.ts";
import type { Scenario, ScenarioEvaluateInput } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bunAvailable,
  createSkippedEvaluation,
  noAddedComments,
  noConsoleLog,
  readOrEmpty,
  runBunTest,
  onlyChangedFiles,
} from "./_shared/helpers.js";

const PROMPT = `Read the spec at playground/hono-api/specs/fix-n-plus-1.md and implement the fix described there. Follow the patterns already established in playground/hono-api/.`;

export const meta = {
  id: "SB-18",
  name: "hono-fix-n-plus-1",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

async function evaluateSB18(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation> {
  const { playgroundDir, toolCalls } = input;
  const fixtureDir = join(playgroundDir, "playground/hono-api");

  const testRun = await runBunTest(fixtureDir, "tests/sb-18-fix-n-plus-1.test.ts");
  const testsPass = testRun.pass;

  const BASE = fixtureDir;
  const ORIG = join(PLAYGROUND_SRC, "hono-api");
  const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
  const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8").catch(() => "");
  const readSpec = toolCalls.some((c) => c.name === "read" && c.args.includes("fix-n-plus-1.md"));
  const stillHasPerRowQuery = /SELECT\s+email\s+FROM\s+users\s+WHERE\s+id\s*=\s*\?/i.test(items);
  const hasPost = /itemsRoutes\.post\(/.test(items);
  const hasDelete = /itemsRoutes\.delete\(/.test(items);

  const scope = await onlyChangedFiles({
    playgroundDir,
    allowedPaths: ["playground/hono-api/src/routes/items.ts"],
  });

  return rubricToEvaluation(
    {
      correctness: [
        {
          name: "bun tests pass",
          pass: testsPass,
          weight: 3,
          detail: testsPass ? undefined : testRun.stdout + "\n" + testRun.stderr,
        },
      ],
      scope: [
        {
          name: "only expected files changed",
          pass: scope.pass,
          weight: 2,
          detail: scope.detail,
        },
      ],
      pattern: [
        {
          name: "keeps deleted_at IS NULL filter",
          pass: /deleted_at\s+IS\s+NULL/i.test(items),
          weight: 0.25,
        },
        {
          name: "keeps ORDER BY id DESC",
          pass: /ORDER\s+BY\s+id\s+DESC/i.test(items),
          weight: 0.25,
        },
        { name: "preserved POST /items handler", pass: hasPost, weight: 0.25 },
        { name: "preserved DELETE handler", pass: hasDelete, weight: 0.25 },
        { name: "uses JOIN on users table", pass: /JOIN\s+users/i.test(items), weight: 0.5 },
        {
          name: "removed per-row owner query",
          pass: !stillHasPerRowQuery,
          weight: 0.5,
        },
      ],
      verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
      cleanup: [
        { name: "no added comments", pass: noAddedComments(items, origItems), weight: 1 },
        { name: "no console.log added", pass: noConsoleLog(items), weight: 1 },
      ],
    },
    {
      pass: "All tests pass, N+1 replaced with JOIN, and other handlers preserved.",
      partial: "Some tests fail or still has per-row query.",
      fail: "Did not fix the N+1 or broke the route.",
    }
  );
}

const scenario: Scenario = {
  id: "SB-18" as ScenarioId,
  name: "hono-fix-n-plus-1",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async execute(ctx) {
    const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;

    if (!bunAvailable()) {
      const output: RuntimeOutput = {
        stdout: "",
        toolCalls: [],
        wallTimeMs: 0 as Ms,
        scenarioMetrics: { skipped: true, reason: "bun-not-on-path" },
      };
      return {
        output,
        evaluation: createSkippedEvaluation("bun on PATH", "SKIPPED: bun not found on PATH"),
      };
    }

    const runStartedAt = performance.now();
    let output: RuntimeOutput;
    try {
      output = await runtime.run({
        workDir,
        prompt: PROMPT,
        timeoutMs,
        onEvent: onRuntimeEvent,
        ...runtimeOverrides,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      output = {
        stdout: "",
        toolCalls: [],
        wallTimeMs: Math.round(performance.now() - runStartedAt) as Ms,
        error: `CRASH: ${msg}`,
      };
    }

    if (output.error) {
      const classification = classifyRuntimeError(output.error);
      return {
        output: {
          ...output,
          scenarioMetrics: {
            ...output.scenarioMetrics,
            runtimeErrorKind: classification.kind,
            scoreExempt: classification.scoreExempt,
          },
        },
        evaluation: runtimeErrorEvaluation(output.error, 10),
      };
    }

    const evaluation = await evaluateSB18({
      stdout: output.stdout,
      playgroundDir: workDir,
      toolCalls: output.toolCalls,
      wallTimeMs: output.wallTimeMs,
      firstTokenMs: output.firstTokenMs,
      turnWallTimes: output.turnWallTimes,
      turnFirstTokenMs: output.turnFirstTokenMs,
      modelMetrics: output.modelMetrics,
      scenarioMetrics: output.scenarioMetrics,
    });

    return { output, evaluation };
  },
  evaluate: evaluateSB18,
};

export default scenario;
