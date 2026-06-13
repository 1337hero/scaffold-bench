import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Runtime, RuntimeEvent, ToolExecutionMode } from "./runtimes/types.ts";
import type { Scenario } from "./scenarios/index.js";
import { PLAYGROUND_SRC } from "./scenarios/index.js";
import { hasTool } from "./scenarios/_shared/toolchain.js";
import type { Ms } from "./schemas/brands.js";
import {
  applyHallucinationPenalty,
  classifyRuntimeError,
  hallucinatedToolCalls,
  runtimeErrorEvaluation,
} from "./scoring.ts";
import type { RuntimeOutput, ScenarioEvaluation, ScenarioResult } from "./scoring.ts";

export interface RunOptions {
  runtime: Runtime;
  scenario: Scenario;
  timeoutMs: number;
  toolExecution?: ToolExecutionMode;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
  signal?: AbortSignal;
  runtimeOverrides?: {
    endpoint?: string;
    model?: string;
    apiKey?: string;
    systemPrompt?: string;
    harness?: string;
  };
}

function withToolExecution(runtime: Runtime, mode?: ToolExecutionMode): Runtime {
  if (!mode) return runtime;

  const inject = <T extends { toolExecution?: ToolExecutionMode }>(ctx: T): T => ({
    ...ctx,
    toolExecution: ctx.toolExecution ?? mode,
  });

  return {
    ...runtime,
    run: (ctx) => runtime.run(inject(ctx)),
    ...(runtime.startSession ? { startSession: (ctx) => runtime.startSession!(inject(ctx)) } : {}),
  };
}

async function evaluateDespiteTimeout(
  scenario: Scenario,
  workDir: string,
  output: RuntimeOutput,
  maxPoints: number
): Promise<ScenarioEvaluation> {
  if (!scenario.evaluate) return runtimeErrorEvaluation("TIMEOUT", maxPoints);
  try {
    return await scenario.evaluate({
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
  } catch {
    return runtimeErrorEvaluation("TIMEOUT", maxPoints);
  }
}

export async function runScenario(opts: RunOptions): Promise<ScenarioResult> {
  if (opts.scenario.requires?.length) {
    const missing = opts.scenario.requires.find((t) => !hasTool(t));
    if (missing) {
      return {
        scenarioId: opts.scenario.id,
        category: opts.scenario.category,
        runtime: opts.runtime.name,
        evaluation: {
          status: "fail",
          points: 0,
          maxPoints: 0,
          checks: [{ name: "toolchain available", pass: false, detail: `${missing} not found` }],
          summary: `Skipped: missing ${missing}`,
        },
        output: {
          stdout: "",
          toolCalls: [],
          wallTimeMs: 0 as Ms,
          scenarioMetrics: { skipped: true, missingTool: missing },
        },
      };
    }
  }

  const workDir = await mkdtemp(join(tmpdir(), "scaffold-bench-"));
  await cp(PLAYGROUND_SRC, join(workDir, "playground"), { recursive: true });

  try {
    let output: RuntimeOutput;
    let evaluation: ScenarioEvaluation;
    const scenarioMaxPoints = opts.scenario.maxPoints ?? 10;

    const runtime = withToolExecution(opts.runtime, opts.toolExecution);

    if (opts.scenario.execute) {
      ({ output, evaluation } = await opts.scenario.execute({
        runtime,
        workDir,
        timeoutMs: opts.timeoutMs,
        onRuntimeEvent: opts.onRuntimeEvent,
        runtimeOverrides: opts.runtimeOverrides,
      }));
    } else {
      const runStartedAt = performance.now();
      try {
        output = await runtime.run({
          workDir,
          prompt: opts.scenario.buildPrompt
            ? await opts.scenario.buildPrompt({ playgroundDir: workDir })
            : opts.scenario.prompt,
          timeoutMs: opts.timeoutMs,
          onEvent: opts.onRuntimeEvent,
          signal: opts.signal,
          ...opts.runtimeOverrides,
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

      // EvaluateScenario branch — the type narrows here so `evaluate` is required.
      if (output.error) {
        const runtimeError = output.error;
        const classification = classifyRuntimeError(runtimeError);
        output = {
          ...output,
          scenarioMetrics: {
            ...output.scenarioMetrics,
            runtimeErrorKind: classification.kind,
            scoreExempt: classification.scoreExempt,
            ...(classification.kind === "timeout" ? { timedOut: true } : {}),
          },
        };
        evaluation =
          classification.kind === "timeout"
            ? applyHallucinationPenalty(
                await evaluateDespiteTimeout(opts.scenario, workDir, output, scenarioMaxPoints),
                output.toolCalls
              )
            : runtimeErrorEvaluation(runtimeError, scenarioMaxPoints);
      } else {
        evaluation = await opts.scenario.evaluate({
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
        evaluation = applyHallucinationPenalty(evaluation, output.toolCalls);
      }
    }

    const hallucinatedCount = hallucinatedToolCalls(output.toolCalls).length;
    if (hallucinatedCount > 0) {
      output = {
        ...output,
        scenarioMetrics: {
          ...output.scenarioMetrics,
          hallucinatedToolCallCount: hallucinatedCount,
        },
      };
    }

    return {
      scenarioId: opts.scenario.id,
      category: opts.scenario.category,
      runtime: opts.runtime.name,
      evaluation,
      output,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
