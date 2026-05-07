import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
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

const PROMPT = `Read the spec at playground/hono-api/specs/cursor-pagination.md and implement the feature described there. Follow the patterns already established in playground/hono-api/.`;

export const meta = {
  id: "SB-15",
  name: "hono-cursor-pagination",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-15" as ScenarioId,
  name: "hono-cursor-pagination",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async execute(ctx) {
    const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;
    const fixtureDir = join(workDir, "playground/hono-api");

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

    const testRun = await runBunTest(fixtureDir, "tests/sb-15-cursor-pagination.test.ts");
    const testsPass = testRun.pass;

    const BASE = fixtureDir;
    const ORIG = join(PLAYGROUND_SRC, "hono-api");
    const items = await readOrEmpty(join(BASE, "src/routes/items.ts"));
    const origItems = await readFile(join(ORIG, "src/routes/items.ts"), "utf-8").catch(() => "");
    const readSpec = output.toolCalls.some(
      (c) => c.name === "read" && c.args.includes("cursor-pagination.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir: workDir,
      allowedPaths: ["playground/hono-api/src/routes/items.ts"],
    });

    const evaluation = rubricToEvaluation(
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
            weight: 0.5,
          },
          {
            name: "keeps ORDER BY id DESC",
            pass: /ORDER\s+BY\s+id\s+DESC/i.test(items),
            weight: 0.5,
          },
          { name: "validates input via AppError", pass: /AppError/.test(items), weight: 0.5 },
          { name: "caps limit at 100", pass: /100/.test(items), weight: 0.5 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(items, origItems), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(items), weight: 1 },
        ],
      },
      {
        pass: "All tests pass with correct response shape and preserved filters.",
        partial: "Some tests fail, or implementation pieces missing.",
        fail: "Did not implement cursor pagination correctly.",
      }
    );

    return { output, evaluation };
  },
};

export default scenario;
