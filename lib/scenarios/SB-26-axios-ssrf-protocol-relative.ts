import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { RuntimeOutput } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  createSkippedEvaluation,
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
} from "./_shared/helpers.js";

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

export const meta = {
  id: "SB-26",
  name: "axios-ssrf-protocol-relative",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sb29-axios-ssrf/",
  prompt: SB29_PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-26" as ScenarioId,
  name: "axios-ssrf-protocol-relative",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async execute(ctx) {
    const { runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides } = ctx;
    const config = {
      fixtureDir: "playground/sb29-axios-ssrf",
      sourcePath: "playground/sb29-axios-ssrf/isAbsoluteURL.mjs",
      testCommand: ["node", "isAbsoluteURL.test.mjs"] as string[],
      preflightCommand: ["node", "--version"] as string[],
    };

    const fixtureDir = join(workDir, config.fixtureDir);
    const sourceFile = join(workDir, config.sourcePath);

    if (config.preflightCommand) {
      const preflight = Bun.spawnSync(config.preflightCommand, { stdout: "pipe", stderr: "pipe" });
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
        prompt: SB29_PROMPT,
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

    const testRun = Bun.spawnSync(config.testCommand, {
      cwd: fixtureDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const testsPass = testRun.exitCode === 0;
    const scope = await onlyChangedFiles({
      playgroundDir: workDir,
      allowedPaths: [config.sourcePath],
    });
    const sourceAfter = await readFile(sourceFile, "utf-8").catch(() => "");
    const sourceBefore = await readFile(
      join(PLAYGROUND_SRC, "sb29-axios-ssrf/isAbsoluteURL.mjs"),
      "utf-8"
    ).catch(() => "");

    const fnMatch = /function\s+isAbsoluteURL\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(sourceAfter);
    const fnBody = fnMatch?.[1] ?? "";
    const stillHasOptionalScheme = /\)\?\s*\\?\/\s*\\?\//.test(fnBody);
    const canonicalFix = fnMatch !== null && !stillHasOptionalScheme;

    // Use rubric for evaluation
    const evaluation = rubricToEvaluation(
      {
        correctness: [
          { name: `${config.testCommand.join(" ")} passes`, pass: testsPass, weight: 2 },
          { name: "optional-scheme group removed from regex", pass: canonicalFix, weight: 1 },
        ],
        scope: [
          {
            name: `only ${config.sourcePath.split("/").pop()} changed`,
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "fix is in the isAbsoluteURL function", pass: fnMatch !== null, weight: 1 },
          {
            name: "protocol-relative test case is handled by helper",
            pass: /\/\/example\.com|\/\/evil\.com|protocol-relative/.test(sourceAfter),
            weight: 1,
          },
        ],
        verification: [
          { name: "tests ran", pass: testsPass || testRun.exitCode !== null, weight: 1 },
        ],
        cleanup: [
          {
            name: "no added comments",
            pass: noAddedComments(sourceAfter, sourceBefore),
            weight: 1,
          },
          { name: "no console.log added", pass: noConsoleLog(sourceAfter), weight: 1 },
        ],
      },
      {
        pass: "Tests pass, only isAbsoluteURL.mjs changed, optional-scheme regex removed.",
        partial: "Tests pass but dangerous `(scheme:)?//` regex still present (wrapper-style fix).",
        fail: "Tests still fail after fix.",
      }
    );

    return { output, evaluation };
  },
};

export default scenario;
