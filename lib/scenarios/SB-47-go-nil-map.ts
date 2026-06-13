import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bashCalls,
  failedVerificationBeforeChange,
  firstChangeTurn,
  onlyChangedFiles,
  passedVerificationAfterChange,
  readOrEmpty,
} from "./_shared/helpers.js";
import { goTest } from "./_shared/runners/go.js";

const GO_API_DIR = "playground/go-api";
const HANDLERS_PATH = "playground/go-api/handlers.go";

const PROMPT =
  "Our Go stats endpoint panics when it receives the first POST request. The handler is in `playground/go-api/handlers.go`. The provided test (`handlers_test.go`) currently fails — fix the handler so the test passes.";

export const meta = {
  id: "SB-47",
  name: "go-nil-map",
  category: "verify-and-repair" as const,
  family: "bug-fix" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: GO_API_DIR,
  requires: ["go"],
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-47" as ScenarioId,
  name: "go-nil-map",
  category: "verify-and-repair",
  family: "bug-fix",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const handlersPath = join(playgroundDir, HANDLERS_PATH);
    const handlersOriginalPath = join(PLAYGROUND_SRC, "go-api/handlers.go");

    const handlers = await readOrEmpty(handlersPath);
    const handlersOriginal = await readOrEmpty(handlersOriginalPath);

    const goApiDir = join(playgroundDir, GO_API_DIR);
    const testResult = await goTest(goApiDir);

    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const goTestMatcher = /go test/;

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [HANDLERS_PATH],
    });

    const usesMake = /var\s+counts\s*=\s*(?:make\s*\(\s*map\[string\]int\s*\)|map\[string\]int\s*\{)/.test(handlers);
    const usesNilCheck = /counts\s*==\s*nil/.test(handlers);
    const patternOk = handlers !== handlersOriginal && usesMake && !usesNilCheck;

    const noPrintln = !/fmt\.Println\s*\(/.test(handlers);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "go test ./... passes after fix",
            pass: testResult.ok,
            weight: 3,
            detail: testResult.ok ? undefined : testResult.stderr + testResult.stdout,
          },
        ],
        scope: [
          {
            name: "only handlers.go changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses make() or map literal, not nil-check workaround",
            pass: patternOk,
            weight: 2,
            detail: patternOk ? undefined : `usesMake=${usesMake} usesNilCheck=${usesNilCheck}`,
          },
        ],
        verification: [
          {
            name: "bash trace: failing test before fix, passing after",
            pass:
              failedVerificationBeforeChange(bashRuns, changeTurn, goTestMatcher) &&
              passedVerificationAfterChange(bashRuns, changeTurn, goTestMatcher),
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no fmt.Println debug output added",
            pass: noPrintln,
            weight: 2,
          },
        ],
      },
      {
        pass: "Nil map fixed with make(); test passes; no debug output.",
        partial: "Partial fix — test may pass but idiom or scope issues remain.",
        fail: "Test still panics or nil map not properly initialized.",
      }
    );
  },
};

export default scenario;
