import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Runtime, RuntimeEvent } from "./runtimes/types.ts";
import type { Scenario } from "./scenarios.ts";
import { PLAYGROUND_SRC } from "./scenarios.ts";
import type { ScenarioResult } from "./scoring.ts";

export interface RunOptions {
  runtime: Runtime;
  scenario: Scenario;
  mode: string;
  timeoutMs: number;
  onRuntimeEvent?: (event: RuntimeEvent) => void;
}

export async function runScenario(opts: RunOptions): Promise<ScenarioResult> {
  const workDir = await mkdtemp(join(tmpdir(), "scaffold-bench-"));
  await cp(PLAYGROUND_SRC, join(workDir, "playground"), { recursive: true });

  try {
    const output = await opts.runtime.run({
      workDir,
      prompt: opts.scenario.prompt,
      mode: opts.mode,
      timeoutMs: opts.timeoutMs,
      onEvent: opts.onRuntimeEvent,
    });

    const evaluation = output.error
      ? {
          status: "fail" as const,
          points: 0 as const,
          checks: [{ name: "completed without runtime error", pass: false, detail: output.error }],
          summary: `Runtime error: ${output.error}`,
        }
      : await opts.scenario.evaluate({
          stdout: output.stdout,
          playgroundDir: workDir,
          toolCalls: output.toolCalls,
        });

    return {
      scenarioId: opts.scenario.id,
      category: opts.scenario.category,
      runtime: opts.runtime.name,
      mode: opts.mode,
      evaluation,
      output,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
