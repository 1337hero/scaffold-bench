import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { Evaluation, checksToEvaluation } from "../scoring.ts";
import type { Check, RuntimeOutput } from "../scoring.ts";
import type { Scenario } from "./types.js";
import {
  PLAYGROUND_SRC,
  TS_COMPILE_COMMAND,
  SB22_LOOP_PATH,
  SB23_LONGCONTEXT_PATH,
  bashCalls,
  computeLineRange,
  createPointBasedEvaluation,
  extractReportedLineRange,
  failedVerificationBeforeChange,
  firstChangeTurn,
  firstFailedVerificationAfterChange,
  numberLines,
  onlyChangedFiles,
  passedVerificationAfterChange,
  rangesWithinTolerance,
  stripComments,
} from "./helpers.js";

const SB22_TURN_PROMPTS = [
  "Fix the typo in playground/sb22-loop.js where the local variable is named `usre` instead of `user`. Only make that one edit.",
  "In playground/sb22-loop.js, change the `ENABLED` default from `false` to `true`. Only make that one edit.",
  "In playground/sb22-loop.js, add the missing `crypto` import so the existing hash call works. Only make that one edit.",
  "In playground/sb22-loop.js, remove the stray `console.log`. Only make that one edit.",
  "In playground/sb22-loop.js, fix the off-by-one loop bound so the loop includes the last item. Only make that one edit.",
] as const;

const SB22_TURN_LABELS = [
  "fixed typo",
  "set ENABLED=true",
  "added crypto import",
  "removed console.log",
  "fixed loop bound",
] as const;

function sb22TurnCheck(source: string, turnIndex: number): { pass: boolean; detail?: string } {
  const checks = [
    {
      label: "typo still present",
      pass: /\bconst\s+user\s*=/.test(source) && !/\bconst\s+usre\s*=/.test(source),
    },
    {
      label: "ENABLED is not true",
      pass: /const\s+ENABLED\s*=\s*true\b/.test(source),
    },
    {
      label: "missing crypto import",
      pass: /^import\s+(?:\*\s+as\s+)?crypto\s+from\s+["']node:crypto["'];?$/m.test(source),
    },
    {
      label: "console.log still present",
      pass: !/console\.log\s*\(/.test(source),
    },
    {
      label: "loop bound still off by one",
      pass: /for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*users\.length\s*;\s*i\+\+\s*\)/.test(source),
    },
  ];
  const blockingIssues = checks
    .slice(0, turnIndex + 1)
    .filter((check) => !check.pass)
    .map((check) => check.label);
  return blockingIssues.length === 0
    ? { pass: true }
    : { pass: false, detail: blockingIssues.join(", ") };
}

export const verifyScenarios: Scenario[] = [
  {
    id: "SB-13" as ScenarioId,
    name: "verify-and-repair",
    category: "verify-and-repair",
    prompt: "Fix calculateSubtotal in playground/cart.mjs and verify the fix.",
    async evaluate({ playgroundDir, toolCalls }) {
      const cart = await readFile(join(playgroundDir, "playground/cart.mjs"), "utf-8");
      const cartOriginal = await readFile(join(PLAYGROUND_SRC, "cart.mjs"), "utf-8");
      const test = await readFile(join(playgroundDir, "playground/cart.test.mjs"), "utf-8");
      const testOriginal = await readFile(join(PLAYGROUND_SRC, "cart.test.mjs"), "utf-8");
      const cartCode = stripComments(cart);
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);
      const cartTestMatcher = /cart\.test\.mjs|bun test|node .*cart\.test\.mjs/;
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/cart.mjs"],
      });

      const checks = [
        {
          name: "edited only cart.mjs",
          pass: scope.pass,
          detail: scope.detail,
        },
        {
          name: "calculateSubtotal multiplies price by quantity",
          pass:
            cart !== cartOriginal &&
            /item\.price\s*\*\s*item\.quantity|item\.quantity\s*\*\s*item\.price/.test(cartCode),
        },
        {
          name: "cart test file left untouched",
          pass: test === testOriginal,
        },
        {
          name: "ran a passing verification command after editing",
          pass: passedVerificationAfterChange(bashRuns, changeTurn, cartTestMatcher),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Fixed the bug and ran a verification command afterward.",
        partial: "Fixed the bug, but skipped verification or changed more than needed.",
        fail: "Did not repair the subtotal logic correctly.",
      });
    },
  },

  {
    id: "SB-14" as ScenarioId,
    name: "verify-fail-recover-pass",
    category: "verify-and-repair",
    prompt:
      "Use the provided test to diagnose and fix playground/slugify.mjs. Verify the failure first, then verify the fix passes. Change only what is necessary.",
    async evaluate({ playgroundDir, toolCalls }) {
      const slugify = await readFile(join(playgroundDir, "playground/slugify.mjs"), "utf-8");
      const slugifyOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.mjs"), "utf-8");
      const test = await readFile(join(playgroundDir, "playground/slugify.test.mjs"), "utf-8");
      const testOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.test.mjs"), "utf-8");
      const slugifyCode = stripComments(slugify);
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);
      const slugifyTestMatcher = /slugify\.test\.mjs|bun test|node .*slugify\.test\.mjs/;
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/slugify.mjs"],
      });

      const checks = [
        {
          name: "verified the failure before changing code",
          pass: failedVerificationBeforeChange(bashRuns, changeTurn, slugifyTestMatcher),
        },
        {
          name: "edited only slugify.mjs",
          pass: scope.pass,
          detail: scope.detail,
        },
        {
          name: "slugify now replaces all whitespace groups",
          pass:
            slugify !== slugifyOriginal &&
            /replace\s*\(\s*\/\\s\+\/g\s*,\s*["'"]`-["'"]`\s*\)/.test(slugifyCode),
        },
        {
          name: "slugify test file left untouched",
          pass: test === testOriginal,
        },
        {
          name: "reran verification and got a passing result",
          pass: passedVerificationAfterChange(bashRuns, changeTurn, slugifyTestMatcher),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Observed the failing test, fixed the implementation, and verified the recovery.",
        partial:
          "Fixed the bug, but skipped either the initial failure check or the final passing verification.",
        fail: "Did not complete the verify-fail-recover-pass loop correctly.",
      });
    },
  },

  {
    id: "SB-15" as ScenarioId,
    name: "typescript-compile-loop",
    category: "verify-and-repair",
    prompt: `Use TypeScript compile feedback to fix playground/ts-compile/user-summary.ts. Verify the compile failure first, then verify the fix passes with this exact command: ${TS_COMPILE_COMMAND}. Change only what is necessary.`,
    async evaluate({ playgroundDir, toolCalls }) {
      const summaryFile = await readFile(
        join(playgroundDir, "playground/ts-compile/user-summary.ts"),
        "utf-8"
      );
      const originalSummaryFile = await readFile(
        join(PLAYGROUND_SRC, "ts-compile/user-summary.ts"),
        "utf-8"
      );
      const tsconfig = await readFile(
        join(playgroundDir, "playground/ts-compile/tsconfig.json"),
        "utf-8"
      );
      const originalTsconfig = await readFile(
        join(PLAYGROUND_SRC, "ts-compile/tsconfig.json"),
        "utf-8"
      );
      const summaryCode = stripComments(summaryFile);
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/ts-compile/user-summary.ts"],
      });

      const checks = [
        {
          name: "verified the compile failure before changing code",
          pass: failedVerificationBeforeChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
        },
        {
          name: "edited only user-summary.ts",
          pass: scope.pass,
          detail: scope.detail,
        },
        {
          name: "user-summary fixes the type issue without type-escape hacks",
          pass:
            summaryFile !== originalSummaryFile &&
            !/lastSeenAt!\.toISOString\s*\(/.test(summaryCode) &&
            !/as\s+any/.test(summaryCode) &&
            !/@ts-ignore/.test(summaryCode) &&
            !/lastSeenAt\s+as\s+Date/.test(summaryCode),
        },
        {
          name: "compile config left untouched",
          pass: tsconfig === originalTsconfig,
        },
        {
          name: "reran compile verification and got a passing result",
          pass: passedVerificationAfterChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Observed the TypeScript compile error, fixed it surgically, and verified the compile passed.",
        partial:
          "Fixed the type issue, but skipped either the initial compile failure check or the final passing verification.",
        fail: "Did not complete the TypeScript compile loop correctly.",
      });
    },
  },

  {
    id: "SB-16" as ScenarioId,
    name: "iterate-to-green",
    category: "verify-and-repair",
    prompt:
      "Use the provided test to iteratively fix playground/normalizeTag.mjs. Verify the failure first, then keep running the test until it passes. Change only what is necessary.",
    async evaluate({ playgroundDir, toolCalls }) {
      const normalizeTag = await readFile(
        join(playgroundDir, "playground/normalizeTag.mjs"),
        "utf-8"
      );
      const originalNormalizeTag = await readFile(
        join(PLAYGROUND_SRC, "normalizeTag.mjs"),
        "utf-8"
      );
      const test = await readFile(join(playgroundDir, "playground/normalizeTag.test.mjs"), "utf-8");
      const originalTest = await readFile(join(PLAYGROUND_SRC, "normalizeTag.test.mjs"), "utf-8");
      const changeTurn = firstChangeTurn(toolCalls);
      const bashRuns = bashCalls(toolCalls);
      const normalizeTestMatcher =
        /normalizeTag\.test\.mjs|bun test|node .*normalizeTag\.test\.mjs/;
      const changeTurns = toolCalls
        .filter((call) => call.name === "edit" || call.name === "write")
        .map((call) => call.turn);
      const failedAfterChange = firstFailedVerificationAfterChange(
        bashRuns,
        changeTurn,
        normalizeTestMatcher
      );

      const changedAgainAfterFailedVerification =
        failedAfterChange !== undefined &&
        changeTurns.some((turn) => turn > failedAfterChange.turn);

      const passedAfterRecovery = passedVerificationAfterChange(
        bashRuns,
        failedAfterChange?.turn,
        normalizeTestMatcher
      );
      const scope = await onlyChangedFiles({
        playgroundDir,
        allowedPaths: ["playground/normalizeTag.mjs"],
      });

      const checks = [
        {
          name: "verified the failure before changing code",
          pass: failedVerificationBeforeChange(bashRuns, changeTurn, normalizeTestMatcher),
        },
        {
          name: "edited only normalizeTag.mjs",
          pass: scope.pass,
          detail: scope.detail,
        },
        {
          name: "normalizeTag test file left untouched",
          pass: test === originalTest,
        },
        {
          name: "saw another failing verification after an initial code change",
          pass: failedAfterChange !== undefined,
        },
        {
          name: "made another code change after the failed verification",
          pass: changedAgainAfterFailedVerification,
        },
        {
          name: "reran verification and got a passing result",
          pass: passedAfterRecovery,
        },
        {
          name: "implementation changed from the original",
          pass: normalizeTag !== originalNormalizeTag,
        },
      ];

      return checksToEvaluation(checks, {
        pass: "Worked through an intermediate failure and iterated the implementation to a passing result.",
        partial: "Reached a correct fix, but did not demonstrate the full iterate-to-green loop.",
        fail: "Did not complete the iterative recovery loop correctly.",
      });
    },
  },

  {
    id: "SB-22" as ScenarioId,
    name: "high-frequency-loop",
    category: "responsiveness",
    maxPoints: 5,
    prompt:
      "Five sequential micro-fixes in one conversation against playground/sb22-loop.js, scored one point per correct edit completed within 10 seconds.",
    async execute({ runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides }) {
      if (!runtime.startSession) {
        const output: RuntimeOutput = {
          stdout: "",
          toolCalls: [],
          wallTimeMs: 0 as Ms,
          error: "CRASH: runtime does not support sessions",
        };
        return {
          output,
          evaluation: createPointBasedEvaluation(
            SB22_TURN_LABELS.map((label) => ({
              name: label,
              pass: false,
              detail: "runtime does not support multi-turn sessions",
            })),
            {
              pass: "Completed all five rapid-fire edits under budget.",
              partial:
                "Completed some of the rapid-fire edits, but missed correctness or timing on others.",
              fail: "Did not complete any of the rapid-fire edits under budget.",
            }
          ),
        };
      }

      const session = await runtime.startSession({
        workDir,
        onEvent: onRuntimeEvent,
        ...runtimeOverrides,
      });
      const loopFile = join(workDir, SB22_LOOP_PATH);
      const turnWallTimes: Ms[] = [];
      const turnFirstTokenMs: Array<Ms | undefined> = [];
      const checks: Check[] = [];
      let totalWallTimeMs = 0;
      let lastOutput: RuntimeOutput = {
        stdout: "",
        toolCalls: [],
        wallTimeMs: 0 as Ms,
      };

      try {
        for (const [index, prompt] of SB22_TURN_PROMPTS.entries()) {
          const output = await session.runTurn(prompt, timeoutMs);
          lastOutput = output;
          totalWallTimeMs += output.wallTimeMs;
          turnWallTimes.push(output.wallTimeMs);
          turnFirstTokenMs.push(output.firstTokenMs);

          const source = await readFile(loopFile, "utf-8");
          const correctness = sb22TurnCheck(source, index);
          const underBudget = output.wallTimeMs <= 10_000;
          const scope = await onlyChangedFiles({
            playgroundDir: workDir,
            allowedPaths: [SB22_LOOP_PATH],
          });
          const pass = !output.error && underBudget && correctness.pass && scope.pass;

          const detailBits = [
            `${(output.wallTimeMs / 1000).toFixed(1)}s`,
            underBudget ? "under budget" : "over 10s budget",
            correctness.detail,
            scope.pass ? undefined : scope.detail,
            output.error,
          ].filter(Boolean);

          checks.push({
            name: `turn ${index + 1}: ${SB22_TURN_LABELS[index]}`,
            pass,
            detail: detailBits.length > 0 ? detailBits.join("; ") : undefined,
          });

          if (output.error) {
            break;
          }
        }
      } finally {
        await session.close?.();
      }

      while (checks.length < SB22_TURN_PROMPTS.length) {
        const index = checks.length;
        checks.push({
          name: `turn ${index + 1}: ${SB22_TURN_LABELS[index]}`,
          pass: false,
          detail: "not attempted after earlier runtime failure",
        });
      }

      const turnUnderBudget = checks.filter((check) => check.pass).length;
      const evaluation = createPointBasedEvaluation(checks, {
        pass: "Completed all five rapid-fire edits under budget.",
        partial:
          "Completed some of the rapid-fire edits, but missed correctness or timing on others.",
        fail: "Did not complete any of the rapid-fire edits under budget.",
      });

      return {
        output: {
          ...lastOutput,
          wallTimeMs: totalWallTimeMs as Ms,
          turnWallTimes,
          turnFirstTokenMs,
          scenarioMetrics: {
            turnUnderBudget,
            turnWallTimes,
            firstTokenMs: turnFirstTokenMs,
          },
        },
        evaluation,
      };
    },
  },

  {
    id: "SB-23" as ScenarioId,
    name: "long-context-retrieval",
    category: "long-context",
    maxPoints: 3,
    prompt:
      "Long inline codebase retrieval: identify `throttleWithJitter`, report its name, line range, and get the first meaningful token out inside 30 seconds.",
    async execute({ runtime, workDir, timeoutMs, onRuntimeEvent, runtimeOverrides }) {
      const MIN_REQUIRED_CTX = 28_000;
      const playgroundDir = workDir;
      const fixturePath = join(playgroundDir, SB23_LONGCONTEXT_PATH);
      const source = await readFile(fixturePath, "utf-8");
      const actualRange = computeLineRange(
        source,
        /function\s+throttleWithJitter\s*\([^)]*\)\s*\{/
      );
      await rm(fixturePath, { force: true });

      const advertisedCtx = runtime.getContextWindow
        ? await runtime.getContextWindow({ workDir, ...runtimeOverrides })
        : undefined;

      if (advertisedCtx !== undefined && advertisedCtx < MIN_REQUIRED_CTX) {
        const reason =
          `model context window ${advertisedCtx} < required ${MIN_REQUIRED_CTX}. ` +
          `Configure llama-server with -c >= 32768 to run SB-23.`;
        const output: RuntimeOutput = {
          stdout: "",
          toolCalls: [],
          wallTimeMs: 0 as Ms,
          scenarioMetrics: { skipped: true, advertisedCtx, minRequiredCtx: MIN_REQUIRED_CTX },
        };
        const evaluation = Evaluation.fail(
          3,
          [
            { name: "reported function name", pass: false, detail: `SKIPPED: ${reason}` },
            { name: "reported line range within ±3 lines", pass: false, detail: "skipped" },
            { name: "first meaningful token within 30s", pass: false, detail: "skipped" },
          ],
          `SKIPPED: ${reason}`
        );
        return { output, evaluation };
      }

      const prompt = [
        "The complete codebase is inlined below. Answer purely from the text in",
        "this prompt — do not use tools, do not read or grep any file.",
        "",
        "Find the function that implements throttling with jitter. Return exactly",
        "two lines in this format:",
        "name: <function name>",
        "line_range: <start>-<end>",
        "",
        numberLines(source),
      ].join("\n");

      const runStartedAt = performance.now();
      let output: RuntimeOutput;
      try {
        output = await runtime.run({
          workDir,
          prompt,
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
        return {
          output,
          evaluation: Evaluation.fail(
            3,
            [{ name: "completed without runtime error", pass: false, detail: output.error }],
            `Runtime error: ${output.error}`
          ),
        };
      }

      const { stdout, firstTokenMs, modelMetrics } = output;
      const reportedRange = extractReportedLineRange(stdout);
      const promptEvalDetail =
        modelMetrics?.promptEvalTokens !== undefined &&
        modelMetrics?.promptEvalTimeMs !== undefined
          ? `${modelMetrics.promptEvalTokens} tok / ${(modelMetrics.promptEvalTimeMs / 1000).toFixed(2)}s`
          : "unavailable";

      const checks = [
        {
          name: "reported function name",
          pass: /\bthrottleWithJitter\b/.test(stdout),
          detail: stdout.trim().slice(0, 160),
        },
        {
          name: "reported line range within ±3 lines",
          pass: actualRange !== null && rangesWithinTolerance(actualRange, reportedRange, 3),
          detail:
            actualRange !== null
              ? `expected ${actualRange.start}-${actualRange.end}; got ${reportedRange ? `${reportedRange.start}-${reportedRange.end}` : "none"}`
              : "could not locate throttleWithJitter in fixture",
        },
        {
          name: "first meaningful token within 30s",
          pass: firstTokenMs !== undefined && firstTokenMs <= 30_000,
          detail: `${firstTokenMs ?? "none"}ms; prompt eval ${promptEvalDetail}`,
        },
      ];

      const evaluation = createPointBasedEvaluation(checks, {
        pass: "Retrieved the target function correctly and started responding quickly.",
        partial: "Found some of the answer, but missed either speed or exact range.",
        fail: "Missed the retrieval target and did not respond quickly enough.",
      });

      return { output, evaluation };
    },
  },
];
