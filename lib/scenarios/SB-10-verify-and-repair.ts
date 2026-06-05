import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bashCalls,
  bunAvailable,
  firstChangeTurn,
  noAddedComments,
  noConsoleLog,
  noExtraFunctions,
  onlyChangedFiles,
  passedVerificationAfterChange,
} from "./_shared/helpers.js";
import { runBehaviorTest } from "./_shared/behavior.js";

export const meta = {
  id: "SB-10",
  name: "verify-and-repair",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  fixturePath: "playground/",
  prompt: `Fix calculateSubtotal in playground/cart.mjs and verify the fix.`,
} as const;

const BEHAVIOR_TEST = join(import.meta.dir, "_shared/behaviors/SB-10/cart.behavior.test.mjs");

const scenario: Scenario = {
  id: "SB-10" as ScenarioId,
  name: "verify-and-repair",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const cart = await readFile(join(playgroundDir, "playground/cart.mjs"), "utf-8");
    const cartOriginal = await readFile(join(PLAYGROUND_SRC, "cart.mjs"), "utf-8");
    const test = await readFile(join(playgroundDir, "playground/cart.test.mjs"), "utf-8");
    const testOriginal = await readFile(join(PLAYGROUND_SRC, "cart.test.mjs"), "utf-8");
    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const cartTestMatcher = /cart\.test\.mjs|bun test|node .*cart\.test\.mjs/;
    const scope = await onlyChangedFiles({ playgroundDir, allowedPaths: ["playground/cart.mjs"] });

    // Behavioral: run the edited cart against an evaluator-owned test proving
    // the subtotal multiplies price × quantity across mixed carts.
    const behavior = bunAvailable()
      ? await runBehaviorTest({
          playgroundDir,
          files: ["playground/cart.mjs"],
          behaviorTestPath: BEHAVIOR_TEST,
        })
      : { pass: false, stdout: "", stderr: "bun unavailable" };

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "calculateSubtotal multiplies price by quantity (behavioral)",
            pass: behavior.pass,
            weight: 3,
            detail: behavior.pass ? undefined : behavior.stdout + "\n" + behavior.stderr,
          },
        ],
        scope: [
          { name: "edited only cart.mjs", pass: scope.pass, weight: 1, detail: scope.detail },
          { name: "cart test file left untouched", pass: test === testOriginal, weight: 1 },
        ],
        pattern: [
          {
            name: "no extra functions introduced",
            pass: noExtraFunctions(cart, cartOriginal),
            weight: 1,
          },
          {
            name: "kept existing export shape",
            pass: /export\s+function\s+calculateSubtotal/.test(cart),
            weight: 1,
          },
        ],
        verification: [
          {
            name: "ran a passing verification command after editing",
            pass: passedVerificationAfterChange(bashRuns, changeTurn, cartTestMatcher),
            weight: 1,
          },
        ],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(cart, cartOriginal), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(cart), weight: 1 },
        ],
      },
      {
        pass: "Fixed the bug and ran a verification command afterward.",
        partial: "Fixed the bug, but skipped verification or changed more than needed.",
        fail: "Did not repair the subtotal logic correctly.",
      }
    );
  },
};

export default scenario;
