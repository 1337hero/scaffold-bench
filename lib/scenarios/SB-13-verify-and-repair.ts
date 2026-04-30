import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  bashCalls,
  firstChangeTurn,
  onlyChangedFiles,
  passedVerificationAfterChange,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-13",
  name: "verify-and-repair",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/",
  prompt: `Fix calculateSubtotal in playground/cart.mjs and verify the fix.`,
} as const;

const scenario: Scenario = {
  id: "SB-13" as ScenarioId,
  name: "verify-and-repair",
  category: "verify-and-repair",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const cart = await readFile(join(playgroundDir, "playground/cart.mjs"), "utf-8");
    const cartOriginal = await readFile(join(PLAYGROUND_SRC, "cart.mjs"), "utf-8");
    const test = await readFile(join(playgroundDir, "playground/cart.test.mjs"), "utf-8");
    const testOriginal = await readFile(join(PLAYGROUND_SRC, "cart.test.mjs"), "utf-8");
    const cartCode = stripComments(cart);
    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const cartTestMatcher = /cart\.test\.mjs|bun test|node .*cart\.test\.mjs/;
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/cart.mjs"],
    });

    const checks = [
      {
        name: "edited only cart.mjs",
        pass: scope.pass,
        detail: scope.detail,
      },
      {
        name: "calculateSubtotal multiplies price by quantity",
        pass:
          cart !== cartOriginal &&
          /item\.price\s*\*\s*item\.quantity|item\.quantity\s*\*\s*item\.price/.test(cartCode),
      },
      {
        name: "cart test file left untouched",
        pass: test === testOriginal,
      },
      {
        name: "ran a passing verification command after editing",
        pass: passedVerificationAfterChange(bashRuns, changeTurn, cartTestMatcher),
      },
    ];

    return checksToEvaluation(checks, {
      pass: "Fixed the bug and ran a verification command afterward.",
      partial: "Fixed the bug, but skipped verification or changed more than needed.",
      fail: "Did not repair the subtotal logic correctly.",
    });
  },
};

export default scenario;
