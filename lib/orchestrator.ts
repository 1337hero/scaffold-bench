import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Runtime, RuntimeEvent } from "./runtimes/types.ts";
import type { Scenario } from "./scenarios.ts";
import { PLAYGROUND_SRC } from "./scenarios.ts";
import type { Ms, ScenarioId } from "./schemas/brands.js";
import { Evaluation } from "./scoring.ts";
import type { RuntimeOutput, ScenarioEvaluation, ScenarioResult } from "./scoring.ts";

export interface RunOptions {
  runtime: Runtime;
  scenario: Scenario;
  timeoutMs: number;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
}

export async function runScenario(opts: RunOptions): Promise<ScenarioResult> {
  const workDir = await mkdtemp(join(tmpdir(), "scaffold-bench-"));
  await cp(PLAYGROUND_SRC, join(workDir, "playground"), { recursive: true });

  try {
    let output: RuntimeOutput;
    let evaluation: ScenarioEvaluation;
    const scenarioMaxPoints = opts.scenario.maxPoints ?? 2;

    if (opts.scenario.execute) {
      ({ output, evaluation } = await opts.scenario.execute({
        runtime: opts.runtime,
        workDir,
        timeoutMs: opts.timeoutMs,
        onRuntimeEvent: opts.onRuntimeEvent,
      }));
    } else {
      const runStartedAt = performance.now();
      try {
        output = await opts.runtime.run({
          workDir,
          prompt: opts.scenario.buildPrompt
            ? await opts.scenario.buildPrompt({ playgroundDir: workDir })
            : opts.scenario.prompt,
          timeoutMs: opts.timeoutMs,
          onEvent: opts.onRuntimeEvent,
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
      evaluation = output.error
        ? Evaluation.fail(
            scenarioMaxPoints,
            [{ name: "completed without runtime error", pass: false, detail: output.error }],
            `Runtime error: ${output.error}`
          )
        : await opts.scenario.evaluate({
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
