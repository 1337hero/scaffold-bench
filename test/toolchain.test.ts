import { describe, expect, it } from "bun:test";
import { runScenario } from "../lib/orchestrator.ts";
import { hasTool } from "../lib/scenarios/_shared/toolchain.js";
import { scenarios } from "../lib/scenarios/index.js";
import type { Scenario } from "../lib/scenarios/index.js";
import type { Runtime } from "../lib/runtimes/types.ts";
import type { ScenarioId } from "../lib/schemas/brands.js";

describe("hasTool", () => {
  it("returns true for bun", () => {
    expect(hasTool("bun")).toBe(true);
  });

  it("returns false for non-existent binary", () => {
    expect(hasTool("definitely-not-a-real-binary-xyz123")).toBe(false);
  });
});

describe("scenario requires declarations", () => {
  const expected: Record<string, string> = {
    "SB-31": "php",
    "SB-32": "php",
    "SB-33": "php",
    "SB-34": "php",
    "SB-40": "shellcheck",
    "SB-47": "go",
    "SB-48": "go",
    "SB-49": "cargo",
    "SB-50": "cargo",
  };

  it("every tool-gated scenario exposes requires on the registered object", () => {
    for (const [id, tool] of Object.entries(expected)) {
      const scenario = scenarios.find((s) => s.id === id);
      expect(scenario, `${id} missing from registry`).toBeDefined();
      expect(scenario?.requires, `${id} must require ${tool}`).toContain(tool);
    }
  });
});

describe("orchestrator toolchain preflight", () => {
  it("skips score-exempt without invoking the model when a tool is missing", async () => {
    let modelInvoked = false;
    const runtime: Runtime = {
      name: "stub",
      async run() {
        modelInvoked = true;
        throw new Error("should not run");
      },
    };
    const scenario = {
      id: "SB-FAKE" as ScenarioId,
      name: "fake",
      category: "surgical-edit",
      family: "bug-fix",
      prompt: "n/a",
      requires: ["definitely-not-a-real-binary-xyz123"],
      evaluate: async () => {
        throw new Error("should not evaluate");
      },
    } as Scenario;

    const result = await runScenario({ runtime, scenario, timeoutMs: 1_000 });

    expect(modelInvoked).toBe(false);
    expect(result.evaluation.maxPoints).toBe(0);
    expect(result.evaluation.points).toBe(0);
    expect(result.evaluation.summary).toContain("Skipped");
    expect(result.output.scenarioMetrics).toMatchObject({
      skipped: true,
      missingTool: "definitely-not-a-real-binary-xyz123",
    });
  });
});
