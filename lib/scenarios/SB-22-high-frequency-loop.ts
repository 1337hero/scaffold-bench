import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../scoring.ts";
import type { Check, RuntimeOutput } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import { SB22_LOOP_PATH, createPointBasedEvaluation, onlyChangedFiles } from "./_shared/helpers.js";

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

export const meta = {
  id: "SB-22",
  name: "high-frequency-loop",
  category: "responsiveness" as const,
  family: "regex-style" as const,
  rubricKind: "custom-5pt" as const,
  signalType: "latency" as const,
  fixturePath: "playground/",
  prompt: `Five sequential micro-fixes in one conversation against playground/sb22-loop.js, scored one point per correct edit completed within 10 seconds.`,
} as const;

const scenario: Scenario = {
  id: "SB-22" as ScenarioId,
  name: "high-frequency-loop",
  category: "responsiveness",
  family: "regex-style",
  maxPoints: 5,
  prompt: meta.prompt,
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

    if (lastOutput.error) {
      const classification = classifyRuntimeError(lastOutput.error);
      if (classification.scoreExempt) {
        return {
          output: {
            ...lastOutput,
            wallTimeMs: totalWallTimeMs as Ms,
            turnWallTimes,
            turnFirstTokenMs,
            scenarioMetrics: {
              ...lastOutput.scenarioMetrics,
              runtimeErrorKind: classification.kind,
              scoreExempt: classification.scoreExempt,
            },
          },
          evaluation: runtimeErrorEvaluation(lastOutput.error, 5),
        };
      }
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
};

export default scenario;
