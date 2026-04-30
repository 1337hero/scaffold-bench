import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  bashCalls,
  failedVerificationBeforeChange,
  firstChangeTurn,
  onlyChangedFiles,
  passedVerificationAfterChange,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-14",
  name: "verify-fail-recover-pass",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/",
  prompt: `Use the provided test to diagnose and fix playground/slugify.mjs. Verify the failure first, then verify the fix passes. Change only what is necessary.`,
} as const;

const scenario: Scenario = {
  id: "SB-14" as ScenarioId,
  name: "verify-fail-recover-pass",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const slugify = await readFile(join(playgroundDir, "playground/slugify.mjs"), "utf-8");
    const slugifyOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.mjs"), "utf-8");
    const test = await readFile(join(playgroundDir, "playground/slugify.test.mjs"), "utf-8");
    const testOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.test.mjs"), "utf-8");
    const slugifyCode = stripComments(slugify);
    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const slugifyTestMatcher = /slugify\.test\.mjs|bun test|node .*slugify\.test\.mjs/;
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/slugify.mjs"],
    });

    const checks = [
      {
        name: "verified the failure before changing code",
        pass: failedVerificationBeforeChange(bashRuns, changeTurn, slugifyTestMatcher),
      },
      {
        name: "edited only slugify.mjs",
        pass: scope.pass,
        detail: scope.detail,
      },
      {
        name: "slugify now replaces all whitespace groups",
        pass:
          slugify !== slugifyOriginal &&
          /replace\s*\(\s*\/\\s\+\/g\s*,\s*["'"]`-["'"]`\s*\)/.test(slugifyCode),
      },
      {
        name: "slugify test file left untouched",
        pass: test === testOriginal,
      },
      {
        name: "reran verification and got a passing result",
        pass: passedVerificationAfterChange(bashRuns, changeTurn, slugifyTestMatcher),
      },
    ];

    return checksToEvaluation(checks, {
      pass: "Observed the failing test, fixed the implementation, and verified the recovery.",
      partial:
        "Fixed the bug, but skipped either the initial failure check or the final passing verification.",
      fail: "Did not complete the verify-fail-recover-pass loop correctly.",
    });
  },
};

export default scenario;
