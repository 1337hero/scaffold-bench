import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bashCalls,
  bunAvailable,
  failedVerificationBeforeChange,
  firstChangeTurn,
  firstFailedVerificationAfterChange,
  noAddedComments,
  noConsoleLog,
  noExtraFunctions,
  onlyChangedFiles,
  passedVerificationAfterChange,
} from "./_shared/helpers.js";
import { runBehaviorTest } from "./_shared/behavior.js";

export const meta = {
  id: "SB-13",
  name: "iterate-to-green",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  difficulty: "medium" as const, // cognitive-load override (field mean inflated by strong-model sample)
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  fixturePath: "playground/",
  prompt: `Use the provided test to iteratively fix playground/normalizeTag.mjs. Verify the failure first, then keep running the test until it passes. Change only what is necessary.`,
} as const;

const BEHAVIOR_TEST = join(
  import.meta.dir,
  "_shared/behaviors/SB-13/normalizeTag.behavior.test.mjs"
);

const scenario: Scenario = {
  id: "SB-13" as ScenarioId,
  name: "iterate-to-green",
  category: "verify-and-repair",
  family: "regression",
  difficulty: "medium",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const normalizeTag = await readFile(
      join(playgroundDir, "playground/normalizeTag.mjs"),
      "utf-8"
    );
    const originalNormalizeTag = await readFile(join(PLAYGROUND_SRC, "normalizeTag.mjs"), "utf-8");
    const test = await readFile(join(playgroundDir, "playground/normalizeTag.test.mjs"), "utf-8");
    const originalTest = await readFile(join(PLAYGROUND_SRC, "normalizeTag.test.mjs"), "utf-8");
    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const normalizeTestMatcher = /normalizeTag\.test\.mjs|bun test|node .*normalizeTag\.test\.mjs/;
    const changeTurns = toolCalls
      .filter((call) => call.name === "edit" || call.name === "write")
      .map((call) => call.turn);
    const failedAfterChange = firstFailedVerificationAfterChange(
      bashRuns,
      changeTurn,
      normalizeTestMatcher
    );
    const changedAgainAfterFailedVerification =
      failedAfterChange !== undefined && changeTurns.some((turn) => turn > failedAfterChange.turn);
    const passedAfterRecovery = passedVerificationAfterChange(
      bashRuns,
      failedAfterChange?.turn,
      normalizeTestMatcher
    );
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/normalizeTag.mjs"],
    });

    // Behavioral correctness gate: the iterated implementation must actually
    // normalize tags (collapse whitespace/underscore/dash runs, trim edges) —
    // process compliance is still scored under verification.
    const behavior = bunAvailable()
      ? await runBehaviorTest({
          playgroundDir,
          files: ["playground/normalizeTag.mjs"],
          behaviorTestPath: BEHAVIOR_TEST,
        })
      : { pass: false, stdout: "", stderr: "bun unavailable" };

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "normalizeTag produces correct slugs (behavioral)",
            pass: behavior.pass,
            weight: 2,
            detail: behavior.pass ? undefined : behavior.stdout + "\n" + behavior.stderr,
          },
          { name: "normalizeTag test file left untouched", pass: test === originalTest, weight: 1 },
        ],
        scope: [
          {
            name: "edited only normalizeTag.mjs",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "no extra functions introduced",
            pass: noExtraFunctions(normalizeTag, originalNormalizeTag),
            weight: 1,
          },
          {
            name: "kept existing export shape",
            pass: /export\s+function\s+normalizeTag/.test(normalizeTag),
            weight: 1,
          },
        ],
        verification: [
          {
            name: "verified the failure before changing code",
            pass: failedVerificationBeforeChange(bashRuns, changeTurn, normalizeTestMatcher),
            weight: 0.3,
          },
          {
            name: "saw another failing verification and iterated",
            pass: failedAfterChange !== undefined && changedAgainAfterFailedVerification,
            weight: 0.3,
          },
          {
            name: "reran verification and got a passing result",
            pass: passedAfterRecovery,
            weight: 0.4,
          },
        ],
        cleanup: [
          {
            name: "no added comments",
            pass: noAddedComments(normalizeTag, originalNormalizeTag),
            weight: 1,
          },
          { name: "no console.log added", pass: noConsoleLog(normalizeTag), weight: 1 },
        ],
      },
      {
        pass: "Worked through an intermediate failure and iterated the implementation to a passing result.",
        partial: "Reached a correct fix, but did not demonstrate the full iterate-to-green loop.",
        fail: "Did not complete the iterative recovery loop correctly.",
      }
    );
  },
};

export default scenario;
