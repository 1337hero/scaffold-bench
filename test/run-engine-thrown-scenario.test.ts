import { describe, expect, it, mock } from "bun:test";
import { rm } from "node:fs/promises";
import { runScenario as realRunScenario } from "../lib/orchestrator.ts";
import type { RunOptions } from "../lib/orchestrator.ts";

const THROW_MODEL = "__throw-in-runscenario__";

// Delegating mock: only the sentinel model throws, so other test files that
// exercise runScenario keep the real implementation.
mock.module("../lib/orchestrator.ts", () => ({
  runScenario: (opts: RunOptions) => {
    if (opts.runtimeOverrides?.model === THROW_MODEL) throw new Error("boom from runScenario");
    return realRunScenario(opts);
  },
}));

const { runBench } = await import("../server/run-engine.ts");
const { scenarios } = await import("../lib/scenarios/index.js");

describe("runBench thrown scenario", () => {
  it("keeps a thrown scenario in results so maxPoints and the report include it", async () => {
    const scenario = scenarios[0]!;
    const { results, totalPoints, maxPoints, resultsPath } = await runBench({
      scenarioIds: [scenario.id],
      model: THROW_MODEL,
    });
    try {
      expect(results).toHaveLength(1);
      const r = results[0]!;
      expect(r.scenarioId).toBe(scenario.id);
      expect(r.evaluation.status).toBe("fail");
      expect(r.evaluation.points).toBe(0);
      expect(r.evaluation.summary).toContain("boom from runScenario");
      expect(totalPoints).toBe(0);
      expect(maxPoints).toBe(scenario.maxPoints ?? 10);

      const report = await Bun.file(resultsPath).json();
      expect(report.results).toHaveLength(1);
      expect(report.maxPoints).toBe(scenario.maxPoints ?? 10);
    } finally {
      await rm(resultsPath, { force: true });
    }
  });
});
