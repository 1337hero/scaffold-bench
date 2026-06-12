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
  noAddedComments,
  noConsoleLog,
  noExtraFunctions,
  onlyChangedFiles,
  passedVerificationAfterChange,
} from "./_shared/helpers.js";
import { runBehaviorTest } from "./_shared/behavior.js";

export const meta = {
  id: "SB-11",
  name: "verify-fail-recover-pass",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  fixturePath: "playground/",
  prompt: `Use the provided test to diagnose and fix playground/slugify.mjs. Verify the failure first, then verify the fix passes. Change only what is necessary.`,
} as const;

const BEHAVIOR_TEST = join(import.meta.dir, "_shared/behaviors/SB-11/slugify.behavior.test.mjs");

const scenario: Scenario = {
  id: "SB-11" as ScenarioId,
  name: "verify-fail-recover-pass",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const slugify = await readFile(join(playgroundDir, "playground/slugify.mjs"), "utf-8");
    const slugifyOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.mjs"), "utf-8");
    const test = await readFile(join(playgroundDir, "playground/slugify.test.mjs"), "utf-8");
    const testOriginal = await readFile(join(PLAYGROUND_SRC, "slugify.test.mjs"), "utf-8");
    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const slugifyTestMatcher = /slugify\.test\.mjs|bun test|node .*slugify\.test\.mjs/;
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/slugify.mjs"],
    });

    // Behavioral: run the edited slugify against an evaluator-owned test proving
    // whitespace groups (spaces, tabs, newlines) collapse to a single dash.
    const behavior = bunAvailable()
      ? await runBehaviorTest({
          playgroundDir,
          files: ["playground/slugify.mjs"],
          behaviorTestPath: BEHAVIOR_TEST,
        })
      : { pass: false, stdout: "", stderr: "bun unavailable" };

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "slugify collapses every whitespace group to a single dash (behavioral)",
            pass: behavior.pass,
            weight: 3,
            detail: behavior.pass ? undefined : behavior.stdout + "\n" + behavior.stderr,
          },
        ],
        scope: [
          { name: "edited only slugify.mjs", pass: scope.pass, weight: 1, detail: scope.detail },
          { name: "slugify test file left untouched", pass: test === testOriginal, weight: 1 },
        ],
        pattern: [
          {
            name: "no extra functions introduced",
            pass: noExtraFunctions(slugify, slugifyOriginal),
            weight: 1,
          },
          {
            name: "kept existing export shape",
            pass: /export\s+function/.test(slugify),
            weight: 1,
          },
        ],
        verification: [
          {
            name: "verified the failure before changing code",
            pass: failedVerificationBeforeChange(bashRuns, changeTurn, slugifyTestMatcher),
            weight: 0.5,
          },
          {
            name: "reran verification and got a passing result",
            pass: passedVerificationAfterChange(bashRuns, changeTurn, slugifyTestMatcher),
            weight: 0.5,
          },
        ],
        cleanup: [
          { name: "no added comments", pass: noAddedComments(slugify, slugifyOriginal), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(slugify), weight: 1 },
        ],
      },
      {
        pass: "Observed the failing test, fixed the implementation, and verified the recovery.",
        partial:
          "Fixed the bug, but skipped either the initial failure check or the final passing verification.",
        fail: "Did not complete the verify-fail-recover-pass loop correctly.",
      }
    );
  },
};

export default scenario;
