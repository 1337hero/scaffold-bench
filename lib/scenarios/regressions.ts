import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { Evaluation, classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { Check, RuntimeOutput, ScenarioEvaluation } from "../scoring.ts";
import type { ExecuteScenario, ScenarioExecutionContext } from "./types.js";
import { createSkippedEvaluation, onlyChangedFiles, stripComments } from "./helpers.js";

type RegressionScenarioConfig = {
  id: ScenarioId;
  name: string;
  prompt: string;
  fixtureDir: string;
  sourcePath: string;
  testCommand: string[];
  preflightCommand?: string[];
  testLabel?: string;
  canonicalCheck?: (input: {
    sourceAfter: string;
    fixtureDir: string;
    workDir: string;
  }) => Promise<Check> | Check;
  passSummary: string;
  partialSummary?: string;
};

function createRegressionScenario(config: RegressionScenarioConfig): ExecuteScenario {
  return {
    id: config.id,
    name: config.name,
    category: "verify-and-repair",
    maxPoints: 2,
    prompt: config.prompt,
    async execute(ctx: ScenarioExecutionContext) {
      const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;
      const fixtureDir = join(workDir, config.fixtureDir);
      const sourceFile = join(workDir, config.sourcePath);

      if (config.preflightCommand) {
        const preflight = Bun.spawnSync(config.preflightCommand, {
          stdout: "pipe",
          stderr: "pipe",
        });
        if (preflight.exitCode !== 0) {
          const output: RuntimeOutput = {
            stdout: "",
            toolCalls: [],
            wallTimeMs: 0 as Ms,
            scenarioMetrics: { skipped: true, reason: `${config.preflightCommand[0]}-not-on-path` },
          };
          return {
            output,
            evaluation: createSkippedEvaluation(
              `${config.preflightCommand[0]} on PATH`,
              `SKIPPED: ${config.preflightCommand[0]} not found on PATH`
            ),
          };
        }
      }

      const runStartedAt = performance.now();
      let output: RuntimeOutput;
      try {
        output = await runtime.run({
          workDir,
          prompt: config.prompt,
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
          evaluation: runtimeErrorEvaluation(output.error, 2),
        };
      }

      const testRun = Bun.spawnSync(config.testCommand, {
        cwd: fixtureDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const testsPass = testRun.exitCode === 0;
      const testOutput = new TextDecoder()
        .decode(testRun.stdout)
        .concat(new TextDecoder().decode(testRun.stderr))
        .trim()
        .slice(0, 240);

      const scope = await onlyChangedFiles({
        playgroundDir: workDir,
        allowedPaths: [config.sourcePath],
      });

      const sourceAfter = await readFile(sourceFile, "utf-8").catch(() => "");

      const canonicalCheckResult = config.canonicalCheck
        ? await Promise.resolve(config.canonicalCheck({ sourceAfter, fixtureDir, workDir }))
        : undefined;

      const checks: Check[] = [
        {
          name: config.testLabel ?? `${config.testCommand.join(" ")} passes`,
          pass: testsPass,
          detail: testOutput,
        },
        {
          name: `only ${config.sourcePath.split("/").pop()} changed`,
          pass: scope.pass,
          detail: scope.detail,
        },
        ...(canonicalCheckResult ? [canonicalCheckResult] : []),
      ];

      let evaluation: ScenarioEvaluation;
      if (!testsPass) {
        evaluation = Evaluation.fail(2, checks, "Tests still fail after fix.");
      } else if (!scope.pass) {
        evaluation = Evaluation.fail(
          2,
          checks,
          "Tests pass but changes touched files outside the allowed source file."
        );
      } else if (!canonicalCheckResult || canonicalCheckResult.pass) {
        evaluation = Evaluation.pass(2, checks, config.passSummary);
      } else {
        evaluation = Evaluation.partial(
          1,
          2,
          checks,
          config.partialSummary ?? "Tests pass but fix doesn't match the canonical pattern."
        );
      }

      return { output, evaluation };
    },
  };
}

const SB29_PROMPT = [
  "Axios's `isAbsoluteURL` helper treats protocol-relative URLs like",
  "`//example.com/` as absolute. That behaviour is the root of",
  "CVE-2024-39338 — an attacker can redirect server-side requests to",
  "arbitrary hosts. Protocol-relative URLs must be treated as RELATIVE.",
  "",
  "Tests live in `playground/sb29-axios-ssrf/isAbsoluteURL.test.mjs`.",
  "The helper is in `playground/sb29-axios-ssrf/isAbsoluteURL.mjs`.",
  "",
  "Run `node isAbsoluteURL.test.mjs` from inside `playground/sb29-axios-ssrf`",
  "to see the failure, then fix `isAbsoluteURL.mjs`. Only edit that file.",
].join("\n");

export const regressionScenarios: ExecuteScenario[] = [
  createRegressionScenario({
    id: "SB-26" as ScenarioId,
    name: "axios-ssrf-protocol-relative",
    prompt: SB29_PROMPT,
    fixtureDir: "playground/sb29-axios-ssrf",
    sourcePath: "playground/sb29-axios-ssrf/isAbsoluteURL.mjs",
    testCommand: ["node", "isAbsoluteURL.test.mjs"],
    preflightCommand: ["node", "--version"],
    passSummary: "Tests pass, only isAbsoluteURL.mjs changed, optional-scheme regex removed.",
    partialSummary:
      "Tests pass but dangerous `(scheme:)?//` regex still present (wrapper-style fix).",
    canonicalCheck({ sourceAfter }) {
      const fnMatch = /function\s+isAbsoluteURL\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(sourceAfter);
      const fnBody = fnMatch?.[1] ?? "";
      const stillHasOptionalScheme = /\)\?\s*\\?\/\s*\\?\//.test(fnBody);
      const canonicalFix = fnMatch !== null && !stillHasOptionalScheme;
      return {
        name: "optional-scheme group removed from regex",
        pass: canonicalFix,
        detail: canonicalFix
          ? "optional scheme removed"
          : "dangerous optional scheme still present",
      };
    },
  }),
];
