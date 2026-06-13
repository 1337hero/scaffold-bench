import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  failedVerificationBeforeChange,
  firstChangeTurn,
  noConsoleLog,
  onlyChangedFiles,
  passedVerificationAfterChange,
  readOrEmpty,
  runBunTest,
} from "./_shared/helpers.js";

const PROMPT = `Our test suite passes when run alone but fails when run together. Test B fails because Test A left state in a shared cache. Both tests are in \`playground/frontend/\`. Please fix the isolation issue — don't skip or delete any tests.`;

export const meta = {
  id: "SB-29",
  name: "test-isolation",
  category: "verify-and-repair" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/frontend/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-29" as ScenarioId,
  name: "test-isolation",
  category: "verify-and-repair",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const testPath = join(playgroundDir, "playground/frontend/cache.test.js");
    const test = await readOrEmpty(testPath);

    const testRun = await runBunTest(
      join(playgroundDir, "playground/frontend"),
      "cache.test.js"
    );

    const noSkip = !/\.skip\s*\(/.test(test) && !/describe\.skip\s*\(/.test(test);
    const noTestRemoved = /Test B/.test(test);
    const hasBeforeEach = /beforeEach\s*\(/.test(test);

    const changeTurn = firstChangeTurn(toolCalls);
    const testCmd = /bun test/;
    const verifiedFailBefore = failedVerificationBeforeChange(toolCalls, changeTurn, testCmd);
    const passedAfter = passedVerificationAfterChange(toolCalls, changeTurn, testCmd);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [
        "playground/frontend/cache.test.js",
        "playground/frontend/cache.js",
      ],
    });

    const evaluation = rubricToEvaluation(
      {
        correctness: [
          {
            name: "tests pass without .skip (real fix, not suppressed)",
            pass: testRun.pass && noSkip && noTestRemoved,
            weight: 3,
            detail: !noSkip
              ? "test.skip found — suppressed instead of fixed"
              : !noTestRemoved
              ? "Test B was removed"
              : testRun.pass
              ? undefined
              : testRun.stdout + "\n" + testRun.stderr,
          },
        ],
        scope: [
          {
            name: "only test files and cache module changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses beforeEach to reset cache",
            pass: hasBeforeEach,
            weight: 2,
            detail: hasBeforeEach ? undefined : "no beforeEach found — cache not reset per test",
          },
        ],
        verification: [
          {
            name: "ran tests before fix (observed failure) and after (verified pass)",
            pass: verifiedFailBefore || passedAfter,
            weight: 1,
            detail: verifiedFailBefore
              ? "saw failing run before edit"
              : passedAfter
              ? "ran tests after fix"
              : "no test run evidence in tool calls",
          },
        ],
        cleanup: [
          {
            name: "no console.log in test or cache files",
            pass: noConsoleLog(test),
            weight: 1,
          },
          {
            name: "no debug artifacts",
            pass: !/console\.(warn|error|debug)\s*\(/.test(test),
            weight: 1,
          },
        ],
      },
      {
        pass: "Both tests pass; isolation fixed via beforeEach; no tests skipped.",
        partial: "Tests pass but used .skip or wrong pattern.",
        fail: "Tests still fail or were skipped/removed instead of fixed.",
      }
    );

    return evaluation;
  },
};

export default scenario;
