import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, bashCalls, failedVerificationBeforeChange, firstChangeTurn, firstFailedVerificationAfterChange, noAddedComments, noConsoleLog, noExtraFunctions, onlyChangedFiles, passedVerificationAfterChange } from "./_shared/helpers.js";

export const meta = {
  id: "SB-16",
  name: "iterate-to-green",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/",
  prompt: `Use the provided test to iteratively fix playground/normalizeTag.mjs. Verify the failure first, then keep running the test until it passes. Change only what is necessary.`,
} as const;

const scenario: Scenario = {
  id: "SB-16" as ScenarioId,
  name: "iterate-to-green",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const normalizeTag = await readFile(join(playgroundDir, "playground/normalizeTag.mjs"), "utf-8");
    const originalNormalizeTag = await readFile(join(PLAYGROUND_SRC, "normalizeTag.mjs"), "utf-8");
    const test = await readFile(join(playgroundDir, "playground/normalizeTag.test.mjs"), "utf-8");
    const originalTest = await readFile(join(PLAYGROUND_SRC, "normalizeTag.test.mjs"), "utf-8");
    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const normalizeTestMatcher = /normalizeTag\.test\.mjs|bun test|node .*normalizeTag\.test\.mjs/;
    const changeTurns = toolCalls.filter((call) => call.name === "edit" || call.name === "write").map((call) => call.turn);
    const failedAfterChange = firstFailedVerificationAfterChange(bashRuns, changeTurn, normalizeTestMatcher);
    const changedAgainAfterFailedVerification = failedAfterChange !== undefined && changeTurns.some((turn) => turn > failedAfterChange.turn);
    const passedAfterRecovery = passedVerificationAfterChange(bashRuns, failedAfterChange?.turn, normalizeTestMatcher);
    const scope = await onlyChangedFiles({ playgroundDir, allowedPaths: ["playground/normalizeTag.mjs"] });

    return rubricToEvaluation({
      correctness: [
        { name: "implementation changed from the original", pass: normalizeTag !== originalNormalizeTag, weight: 1 },
        { name: "reran verification and got a passing result", pass: passedAfterRecovery, weight: 1 },
        { name: "normalizeTag test file left untouched", pass: test === originalTest, weight: 1 },
      ],
      scope: [
        { name: "edited only normalizeTag.mjs", pass: scope.pass, weight: 2, detail: scope.detail },
      ],
      pattern: [
        { name: "no extra functions introduced", pass: noExtraFunctions(normalizeTag, originalNormalizeTag), weight: 1 },
        { name: "kept existing export shape", pass: /export\s+function\s+normalizeTag/.test(normalizeTag), weight: 1 },
      ],
      verification: [
        { name: "verified the failure before changing code", pass: failedVerificationBeforeChange(bashRuns, changeTurn, normalizeTestMatcher), weight: 0.5 },
        { name: "saw another failing verification and iterated", pass: failedAfterChange !== undefined && changedAgainAfterFailedVerification, weight: 0.5 },
      ],
      cleanup: [
        { name: "no added comments", pass: noAddedComments(normalizeTag, originalNormalizeTag), weight: 1 },
        { name: "no console.log added", pass: noConsoleLog(normalizeTag), weight: 1 },
      ],
    }, {
      pass: "Worked through an intermediate failure and iterated the implementation to a passing result.",
      partial: "Reached a correct fix, but did not demonstrate the full iterate-to-green loop.",
      fail: "Did not complete the iterative recovery loop correctly.",
    });
  },
};

export default scenario;
