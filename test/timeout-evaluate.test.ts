import { describe, expect, it } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runScenario } from "../lib/orchestrator.ts";
import { Evaluation } from "../lib/scoring.ts";
import type { Runtime } from "../lib/runtimes/types.ts";
import type { Scenario } from "../lib/scenarios/index.js";
import type { Ms, ScenarioId } from "../lib/schemas/brands.js";

function stubScenario(): Scenario {
  return {
    id: "SB-TEST" as ScenarioId,
    name: "stub",
    category: "surgical-edit",
    family: "regression",
    prompt: "fix it",
    maxPoints: 10,
    evaluate: async ({ playgroundDir }) => {
      const marker = await Bun.file(join(playgroundDir, "playground", "FIXED.txt")).exists();
      const checks = [{ name: "fix landed", pass: marker }];
      return marker
        ? Evaluation.pass(10, checks, "fixed")
        : Evaluation.fail(10, checks, "not fixed");
    },
  } as Scenario;
}

function timeoutRuntime(): Runtime {
  return {
    name: "stub",
    async run(ctx) {
      await writeFile(join(ctx.workDir, "playground", "FIXED.txt"), "done");
      return {
        stdout: "",
        toolCalls: [],
        wallTimeMs: 600_000 as Ms,
        error: "TIMEOUT",
      };
    },
  };
}

describe("timeout handling", () => {
  it("evaluates the playground state on timeout instead of auto-failing", async () => {
    const result = await runScenario({
      runtime: timeoutRuntime(),
      scenario: stubScenario(),
      timeoutMs: 1_000,
    });
    expect(result.evaluation.status).toBe("pass");
    expect(result.evaluation.points).toBe(10);
    expect(result.output.scenarioMetrics?.timedOut).toBe(true);
    expect(result.output.scenarioMetrics?.runtimeErrorKind).toBe("timeout");
  });

  it("keeps the runtime-error path for crashes", async () => {
    const crashing: Runtime = {
      name: "stub",
      async run() {
        return { stdout: "", toolCalls: [], wallTimeMs: 1 as Ms, error: "CRASH: boom" };
      },
    };
    const result = await runScenario({
      runtime: crashing,
      scenario: stubScenario(),
      timeoutMs: 1_000,
    });
    expect(result.evaluation.status).toBe("fail");
    expect(result.evaluation.summary).toContain("Runtime error");
  });
});

describe("workspace cleanup", () => {
  it("does not corrupt the result when the model leaves a read-only dir", async () => {
    let workDir = "";
    const messy: Runtime = {
      name: "stub",
      async run(ctx) {
        workDir = ctx.workDir;
        const locked = join(ctx.workDir, "playground", "locked");
        await mkdir(locked);
        await writeFile(join(locked, "trap.txt"), "cannot delete me");
        await chmod(locked, 0o500);
        await writeFile(join(ctx.workDir, "playground", "FIXED.txt"), "done");
        return { stdout: "", toolCalls: [], wallTimeMs: 1 as Ms };
      },
    };
    const result = await runScenario({
      runtime: messy,
      scenario: stubScenario(),
      timeoutMs: 1_000,
    });
    expect(result.evaluation.status).toBe("pass");
    expect(existsSync(workDir)).toBe(false);
  });
});
