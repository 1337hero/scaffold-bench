import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Ms, ScenarioId } from "../schemas/brands.js";
import {
  Evaluation,
  classifyRuntimeError,
  runtimeErrorEvaluation,
} from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  SB23_LONGCONTEXT_PATH,
  computeLineRange,
  createPointBasedEvaluation,
  extractReportedLineRange,
  numberLines,
  rangesWithinTolerance,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-23",
  name: "long-context-retrieval",
  category: "long-context" as const,
  family: "regex-style" as const,
  rubricKind: "custom-3pt" as const,
  fixturePath: "playground/",
  prompt: `Long inline codebase retrieval: identify \`throttleWithJitter\`, report its name, line range, and get the first meaningful token out inside 30 seconds.`,
} as const;

const scenario: Scenario = {
  id: "SB-23" as ScenarioId,
  name: "long-context-retrieval",
  category: "long-context",
  maxPoints: 3,
  prompt: meta.prompt,
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
        evaluation: runtimeErrorEvaluation(output.error, 3),
      };
    }

    const { stdout, firstTokenMs, modelMetrics } = output;
    const reportedRange = extractReportedLineRange(stdout);
    const promptEvalDetail =
      modelMetrics?.promptEvalTokens !== undefined && modelMetrics?.promptEvalTimeMs !== undefined
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
};

export default scenario;
