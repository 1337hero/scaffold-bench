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

const PROMPT = `Read the spec at playground/hono-api/specs/soft-delete-restore.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`;

export const meta = {
  id: "SB-17",
  name: "hono-soft-delete-restore",
  category: "implementation" as const,
  family: "spec-impl" as const,
  difficulty: "low" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

async function evaluateSB17(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation> {
  const { playgroundDir, toolCalls } = input;
  const fixtureDir = join(playgroundDir, "playground/hono-api");

  const testRun = await runBunTest(fixtureDir, "tests/sb-17-soft-delete-restore.test.ts");
  const testsPass = testRun.pass;

  const BASE = fixtureDir;
  const ORIG = join(PLAYGROUND_SRC, "hono-api");
  const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
  const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8").catch(() => "");
  const readSpec = toolCalls.some(
    (c) => c.name === "read" && c.args.includes("soft-delete-restore.md")
  );
  const hasGet = /itemsRoutes\.get\(\s*["']\/items["']/.test(items);
  const hasPost = /itemsRoutes\.post\(\s*["']\/items["']/.test(items);
  const hasDelete = /itemsRoutes\.delete\(\s*["']\/items\/:id["']/.test(items);

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
        { name: "preserved GET /items handler", pass: hasGet, weight: 0.5 },
        { name: "preserved POST /items handler", pass: hasPost, weight: 0.5 },
        { name: "preserved DELETE /items/:id handler", pass: hasDelete, weight: 0.5 },
        {
          name: "uses not_deleted code on already-active",
          pass: /not_deleted/.test(items),
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
      pass: "All tests pass with correct restore route and preserved handlers.",
      partial: "Some tests fail, or implementation pieces missing.",
      fail: "Did not implement the restore endpoint correctly.",
    }
  );
}

const scenario: Scenario = {
  id: "SB-17" as ScenarioId,
  name: "hono-soft-delete-restore",
  category: "implementation",
  family: "spec-impl",
  difficulty: "low",
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

    const evaluation = await evaluateSB17({
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
  evaluate: evaluateSB17,
};

export default scenario;
