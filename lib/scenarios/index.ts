import { coreScenarios } from "./core.js";
import { frontendScenarios } from "./frontend.js";
import { verifyScenarios } from "./verify.js";
import { honoScenarios } from "./hono.js";
import { regressionScenarios } from "./regressions.js";
import type { Scenario } from "./types.js";

export const scenarios: Scenario[] = [
  ...coreScenarios,
  ...frontendScenarios,
  ...verifyScenarios,
  ...honoScenarios,
  ...regressionScenarios,
];

if (scenarios.length !== 30) {
  throw new Error(`Expected 30 active scenarios, got ${scenarios.length}`);
}

export { PLAYGROUND_SRC } from "./helpers.js";
export type { Scenario, EvaluateScenario, ExecuteScenario } from "./types.js";
