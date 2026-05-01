import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, bashCalls, failedVerificationBeforeChange, firstChangeTurn, noAddedComments, noConsoleLog, noExtraFunctions, onlyChangedFiles, passedVerificationAfterChange, stripComments } from "./_shared/helpers.js";

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
    const scope = await onlyChangedFiles({ playgroundDir, allowedPaths: ["playground/slugify.mjs"] });

    return rubricToEvaluation({
      correctness: [
        { name: "slugify now replaces all whitespace groups", pass: slugify !== slugifyOriginal && /replace\s*\(\s*\/\\s\+\/g\s*,\s*["'"]`-["'"]`\s*\)/.test(slugifyCode), weight: 3 },
      ],
      scope: [
        { name: "edited only slugify.mjs", pass: scope.pass, weight: 1, detail: scope.detail },
        { name: "slugify test file left untouched", pass: test === testOriginal, weight: 1 },
      ],
      pattern: [
        { name: "no extra functions introduced", pass: noExtraFunctions(slugify, slugifyOriginal), weight: 1 },
        { name: "kept existing export shape", pass: /export\s+function/.test(slugify), weight: 1 },
      ],
      verification: [
        { name: "verified the failure before changing code", pass: failedVerificationBeforeChange(bashRuns, changeTurn, slugifyTestMatcher), weight: 0.5 },
        { name: "reran verification and got a passing result", pass: passedVerificationAfterChange(bashRuns, changeTurn, slugifyTestMatcher), weight: 0.5 },
      ],
      cleanup: [
        { name: "no added comments", pass: noAddedComments(slugify, slugifyOriginal), weight: 1 },
        { name: "no console.log added", pass: noConsoleLog(slugify), weight: 1 },
      ],
    }, {
      pass: "Observed the failing test, fixed the implementation, and verified the recovery.",
      partial: "Fixed the bug, but skipped either the initial failure check or the final passing verification.",
      fail: "Did not complete the verify-fail-recover-pass loop correctly.",
    });
  },
};

export default scenario;
