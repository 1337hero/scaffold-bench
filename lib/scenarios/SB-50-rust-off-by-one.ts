import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  bashCalls,
  changedPaths,
  failedVerificationBeforeChange,
  firstChangeTurn,
  onlyChangedFiles,
  passedVerificationAfterChange,
  readOrEmpty,
} from "./_shared/helpers.js";
import { cargoTest } from "./_shared/runners/cargo.js";

const RUST_LIB_DIR = "playground/rust-lib";
const LIB_PATH = "playground/rust-lib/src/lib.rs";

const PROMPT =
  "The `running_totals` function in `playground/rust-lib/src/lib.rs` fails its test — the last element is missing from the result. Fix the function, not the test.";

export const meta = {
  id: "SB-50",
  name: "rust-off-by-one",
  category: "verify-and-repair" as const,
  family: "bug-fix" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: RUST_LIB_DIR,
  requires: ["cargo"],
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-50" as ScenarioId,
  name: "rust-off-by-one",
  category: "verify-and-repair",
  family: "bug-fix",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const libPath = join(playgroundDir, LIB_PATH);
    const lib = await readOrEmpty(libPath);
    const libOriginal = await readOrEmpty(join(PLAYGROUND_SRC, "rust-lib/src/lib.rs"));

    const rustLibDir = join(playgroundDir, RUST_LIB_DIR);
    const testResult = await cargoTest(rustLibDir);

    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const cargoTestMatcher = /cargo\s+test/;

    const changed = changedPaths(toolCalls);
    const onlyLibChanged =
      changed.length > 0 && changed.every((p) => p === LIB_PATH || p.endsWith("lib.rs"));

    const noTakeNMinus1 = !/.take\s*\(\s*n\s*-\s*1\s*\)/.test(lib);
    const testUnchanged = lib.includes("vec![1, 3, 6, 10]");
    const noClone = !/\.clone\s*\(\s*\)/.test(lib);
    const patternOk = noTakeNMinus1 && testUnchanged && noClone;

    const noPrintln = !/println!\s*\(/.test(lib);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "cargo test passes",
            pass: testResult.ok,
            weight: 3,
            detail: testResult.ok ? undefined : testResult.stderr + testResult.stdout,
          },
        ],
        scope: [
          {
            name: "only lib.rs changed",
            pass: onlyLibChanged,
            weight: 2,
            detail: `changed: ${changed.join(", ")}`,
          },
        ],
        pattern: [
          {
            name: "fix is in function (not test); no .clone() added",
            pass: patternOk,
            weight: 2,
            detail: patternOk
              ? undefined
              : `noTakeNMinus1=${noTakeNMinus1} testUnchanged=${testUnchanged} noClone=${noClone}`,
          },
        ],
        verification: [
          {
            name: "bash trace: failing test before fix, passing after",
            pass:
              failedVerificationBeforeChange(bashRuns, changeTurn, cargoTestMatcher) &&
              passedVerificationAfterChange(bashRuns, changeTurn, cargoTestMatcher),
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no println! debug macros left",
            pass: noPrintln,
            weight: 2,
          },
        ],
      },
      {
        pass: "Off-by-one fixed in function; cargo test passes; test assertion unchanged.",
        partial: "Test passes but test was modified or other issues remain.",
        fail: "cargo test still fails.",
      }
    );
  },
};

export default scenario;
