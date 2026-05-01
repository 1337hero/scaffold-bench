import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { createSkippedEvaluation, noConsoleLog, onlyChangedFiles } from "./_shared/helpers.js";

const SB41_PROMPT = [
  "The auth tests in `playground/express-api` show `/api/me` returning 200 when it should return 401.",
  "Fix the bug in `src/server.ts` and verify the tests pass.",
].join("\n");

export const meta = {
  id: "SB-41",
  name: "express-middleware-order",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/express-api/",
  prompt: SB41_PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-41" as ScenarioId,
  name: "express-middleware-order",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async execute(ctx) {
    const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;
    const fixtureDir = join(workDir, "playground/express-api");
    const sourceFile = join(workDir, "playground/express-api/src/server.ts");

    // Preflight: check bun is on PATH
    const preflight = Bun.spawnSync(["bun", "--version"], { stdout: "pipe", stderr: "pipe" });
    if (preflight.exitCode !== 0) {
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
        prompt: SB41_PROMPT,
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

    // Run vitest
    const testRun = Bun.spawnSync(["bun", "x", "vitest", "run", "tests/auth-order.test.ts"], {
      cwd: fixtureDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const testsPass = testRun.exitCode === 0;

    const scope = await onlyChangedFiles({
      playgroundDir: workDir,
      allowedPaths: ["playground/express-api/src/server.ts"],
    });
    const sourceAfter = await readFile(sourceFile, "utf-8").catch(() => "");

    // Canonical check: verify the four-line ordering
    const lines = sourceAfter
      .split("\n")
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !l.startsWith("//") &&
          !l.startsWith("import") &&
          !l.startsWith("const") &&
          !l.startsWith("export")
      );
    const publicRoutesIdx = lines.findIndex((l) => /publicRoutes/.test(l) && /app\.use/.test(l));
    const requireAuthIdx = lines.findIndex((l) => /requireAuth/.test(l) && /app\.use/.test(l));
    const privateRoutesIdx = lines.findIndex((l) => /privateRoutes/.test(l) && /app\.use/.test(l));
    const jsonIdx = lines.findIndex((l) => /express\.json/.test(l));
    const firstRouteUseIdx = [publicRoutesIdx, privateRoutesIdx].find((i) => i >= 0) ?? -1;

    const canonicalOrder =
      jsonIdx >= 0 &&
      firstRouteUseIdx >= 0 &&
      jsonIdx < firstRouteUseIdx &&
      publicRoutesIdx >= 0 &&
      requireAuthIdx >= 0 &&
      publicRoutesIdx < requireAuthIdx &&
      requireAuthIdx >= 0 &&
      privateRoutesIdx >= 0 &&
      requireAuthIdx < privateRoutesIdx;

    const evaluation = rubricToEvaluation(
      {
        correctness: [
          { name: "vitest passes", pass: testsPass, weight: 2 },
          {
            name: "auth ordering at least partially correct",
            pass: requireAuthIdx >= 0 && privateRoutesIdx >= 0 && requireAuthIdx < privateRoutesIdx,
            weight: 1,
          },
        ],
        scope: [
          { name: "only src/server.ts changed", pass: scope.pass, weight: 2, detail: scope.detail },
        ],
        pattern: [
          { name: "canonical four-line ordering matches", pass: canonicalOrder, weight: 1 },
          {
            name: "express.json() before routes",
            pass: jsonIdx >= 0 && firstRouteUseIdx >= 0 && jsonIdx < firstRouteUseIdx,
            weight: 1,
          },
        ],
        verification: [{ name: "test command ran", pass: testRun.exitCode !== null, weight: 1 }],
        cleanup: [
          { name: "no console.log added", pass: noConsoleLog(sourceAfter), weight: 1 },
          {
            name: "no commented-out lines",
            pass: !/^\s*\/\//.test(
              sourceAfter.split("\n").find((l) => l.includes("app.use")) ?? ""
            ),
            weight: 1,
          },
        ],
      },
      {
        pass: "Tests pass, only server.ts changed, canonical middleware order.",
        partial: "Tests pass but fix is superficial or order not canonical.",
        fail: "Tests still fail after fix.",
      }
    );

    return { output, evaluation };
  },
};

export default scenario;
