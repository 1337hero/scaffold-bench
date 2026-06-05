import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ms } from "../../lib/schemas/brands.js";
import type { ScenarioEvaluateInput } from "../../lib/scenarios/_shared/types.js";
import { PLAYGROUND_SRC } from "../../lib/scenarios/_shared/helpers.js";
import type { Scenario } from "../../lib/scenarios/_shared/types.js";
import type { Runtime } from "../../lib/runtimes/types.ts";
import type {
  RubricBreakdown,
  RuntimeOutput,
  ScenarioEvaluation,
  ToolCall,
} from "../../lib/scoring.ts";

/**
 * Build synthetic tool calls so gold solutions satisfy read-before-edit
 * (verification) and scope checks. Emits a `read` at turn 0 then an `edit`
 * at turn 1 for each path, matching ReadArgsSchema/EditArgsSchema shapes.
 */
export function readThenEdit(paths: string[]): ToolCall[] {
  return paths.flatMap((path, index) => [
    {
      name: "read",
      args: JSON.stringify({ path }),
      turn: index * 2,
    },
    {
      name: "edit",
      args: JSON.stringify({ path, old_str: "", new_str: "" }),
      turn: index * 2 + 1,
    },
  ]);
}

/**
 * Stub Runtime for execute-style gates: `run()` is a no-op model turn that
 * just echoes back the synthetic tool calls (and optional stdout) the gate
 * supplies. The gold/broken reference files already represent the post-edit
 * state, so the scenario's own preflight + test command run against those.
 */
function stubRuntime(toolCalls: ToolCall[], stdout: string): Runtime {
  return {
    name: "gate-stub",
    async run(): Promise<RuntimeOutput> {
      return { stdout, toolCalls, wallTimeMs: 1000 as Ms };
    },
  };
}

/**
 * Evaluate a reference solution (gold or broken) against a scenario. Copies
 * pristine fixture into <workDir>/playground/, overlays the referenceDir tree
 * on top, runs the scenario, cleans up the temp dir.
 *
 * - evaluate-style: calls scenario.evaluate with synthetic toolCalls/stdout.
 * - execute-style: calls scenario.execute with a stub Runtime whose run()
 *   returns the synthetic toolCalls/stdout, then returns result.evaluation.
 *   The scenario's real preflight + test command run against the reference
 *   files, making the gate genuinely behavioral.
 */
export async function evaluateReference(opts: {
  scenario: Scenario;
  referenceDir: string;
  toolCalls?: ToolCall[];
  stdout?: string;
  pristineDir?: string;
  extraInput?: Partial<ScenarioEvaluateInput>;
}): Promise<ScenarioEvaluation> {
  const workDir = await mkdtemp(join(tmpdir(), "sb-gate-"));
  try {
    const playgroundDir = join(workDir, "playground");
    await cp(opts.pristineDir ?? PLAYGROUND_SRC, playgroundDir, { recursive: true });
    await cp(opts.referenceDir, playgroundDir, { recursive: true });

    if (opts.scenario.evaluate === undefined) {
      const runtime = stubRuntime(opts.toolCalls ?? [], opts.stdout ?? "");
      const result = await opts.scenario.execute({
        runtime,
        workDir,
        timeoutMs: 600_000,
        onRuntimeEvent: undefined,
        runtimeOverrides: undefined,
      });
      return result.evaluation;
    }

    const input: ScenarioEvaluateInput = {
      stdout: opts.stdout ?? "",
      playgroundDir: workDir,
      toolCalls: opts.toolCalls ?? [],
      wallTimeMs: 1000 as Ms,
      ...opts.extraInput,
    };

    return await opts.scenario.evaluate(input);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function breakdownLine(breakdown: RubricBreakdown | undefined): string {
  if (!breakdown) return "n/a";
  return (Object.keys(breakdown) as Array<keyof RubricBreakdown>)
    .map((k) => `${k}=${breakdown[k]}`)
    .join(" ");
}

/**
 * Gate a scenario: gold must score >= 9, broken must score <= 4.
 * Throws a descriptive error (with per-dimension breakdown) on failure.
 */
export async function assertGate(opts: {
  scenario: Scenario;
  goldDir: string;
  brokenDir: string;
  goldToolCalls?: ToolCall[];
  brokenToolCalls?: ToolCall[];
  goldStdout?: string;
  brokenStdout?: string;
  pristineDir?: string;
}): Promise<{ gold: number; broken: number }> {
  const gold = await evaluateReference({
    scenario: opts.scenario,
    referenceDir: opts.goldDir,
    toolCalls: opts.goldToolCalls,
    stdout: opts.goldStdout,
    pristineDir: opts.pristineDir,
  });
  const broken = await evaluateReference({
    scenario: opts.scenario,
    referenceDir: opts.brokenDir,
    toolCalls: opts.brokenToolCalls,
    stdout: opts.brokenStdout,
    pristineDir: opts.pristineDir,
  });

  const errors: string[] = [];
  if (gold.points < 9) {
    errors.push(
      `gold scored ${gold.points}/${gold.maxPoints} (expected >= 9) [${breakdownLine(gold.rubricBreakdown)}]`
    );
  }
  if (broken.points > 4) {
    errors.push(
      `broken scored ${broken.points}/${broken.maxPoints} (expected <= 4) [${breakdownLine(broken.rubricBreakdown)}]`
    );
  }
  if (errors.length > 0) {
    throw new Error(`gate failed for "${opts.scenario.id}": ${errors.join("; ")}`);
  }

  return { gold: gold.points, broken: broken.points };
}
