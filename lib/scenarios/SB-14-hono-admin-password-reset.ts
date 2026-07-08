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
  noConsoleLog,
  readOrEmpty,
  runBunTest,
  onlyChangedFiles,
} from "./_shared/helpers.js";

const PROMPT = `Read the spec at playground/hono-api/specs/admin-password-reset.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`;

export const meta = {
  id: "SB-14",
  name: "hono-admin-password-reset",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

async function evaluateSB14(input: ScenarioEvaluateInput): Promise<ScenarioEvaluation> {
  const { playgroundDir, toolCalls } = input;
  const fixtureDir = join(playgroundDir, "playground/hono-api");

  const testRun = await runBunTest(fixtureDir, "tests/sb-14-password-resets.test.ts");
  const testsPass = testRun.pass;

  const BASE = fixtureDir;
  const ORIG = join(PLAYGROUND_SRC, "hono-api");
  const schema = await readOrEmpty(join(BASE, "schema.sql"));
  const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8").catch(() => "");
  const index = await readOrEmpty(join(BASE, "src/index.ts"));
  const origIndex = await readFile(join(ORIG, "src/index.ts"), "utf-8").catch(() => "");
  const resetRoute = await readOrEmpty(join(BASE, "src/routes/password-resets.ts"));
  const readSpec = toolCalls.some(
    (c) => c.name === "read" && c.args.includes("admin-password-reset.md")
  );

  // Strict filesystem scope check (replaces per-file string comparisons)
  const scope = await onlyChangedFiles({
    playgroundDir,
    allowedPaths: [
      "playground/hono-api/src/routes/password-resets.ts",
      "playground/hono-api/src/index.ts",
      "playground/hono-api/schema.sql",
    ],
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
          name: "uses AppError from lib/errors",
          pass: /AppError/.test(resetRoute) && /from\s+["'][^"']*errors["']/.test(resetRoute),
          weight: 0.75,
        },
        {
          name: "index.ts mounts both routers",
          pass:
            index !== origIndex &&
            /adminPasswordResetsRoutes/.test(index) &&
            /passwordResetsRoutes/.test(index),
          weight: 0.75,
        },
        {
          name: "schema adds password_resets table with used_at and expires_at",
          pass:
            schema !== origSchema &&
            /CREATE\s+TABLE[^;]*password_resets/i.test(schema) &&
            /used_at/i.test(schema) &&
            /expires_at/i.test(schema),
          weight: 0.5,
        },
      ],
      verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
      cleanup: [
        { name: "no console.log added", pass: noConsoleLog(resetRoute), weight: 1 },
        {
          name: "no commented-out code",
          pass: !/^\s*\/\/.*(TODO|FIXME|XXX)/m.test(resetRoute),
          weight: 1,
        },
      ],
    },
    {
      pass: "All tests pass with correct file layout, patterns, and session invalidation.",
      partial: "Some tests fail, or implementation pieces missing.",
      fail: "Did not produce a workable implementation.",
    }
  );
}

const scenario: Scenario = {
  id: "SB-14" as ScenarioId,
  name: "hono-admin-password-reset",
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

    const evaluation = await evaluateSB14({
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
  evaluate: evaluateSB14,
};

export default scenario;
