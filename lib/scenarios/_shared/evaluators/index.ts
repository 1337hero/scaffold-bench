import type { Ms } from "../../../schemas/brands.js";
import type { RuntimeOutput, ScenarioEvaluation } from "../../../scoring.ts";

export * from "./vitest.js";
export * from "./ast.js";
export * from "./instrument.js";
export * from "./playwright.js";
export * from "./axe.js";
export * from "./hidden.js";

export type { SkippedResult } from "./playwright.js";

/**
 * Turn a skipped REQUIRED evaluator into a SCORE-EXEMPT scenario result:
 * maxPoints = 0 and scenarioMetrics.skipped = true (mirrors SB-21's pattern).
 * Reporting excludes score-exempt rows from leaderboards.
 */
export function scoreExemptSkip(
  checkName: string,
  reason: string
): { output: RuntimeOutput; evaluation: ScenarioEvaluation } {
  const summary = `SKIPPED: ${reason}`;
  return {
    output: {
      stdout: "",
      toolCalls: [],
      wallTimeMs: 0 as Ms,
      scenarioMetrics: { skipped: true, reason },
    },
    evaluation: {
      status: "fail",
      points: 0,
      maxPoints: 0,
      checks: [{ name: checkName, pass: false, detail: summary }],
      summary,
    },
  };
}
