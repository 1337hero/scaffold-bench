import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  bashCalls,
  changedPaths,
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
  searchBeforeEdit,
} from "./_shared/helpers.js";
import { cargoCheck } from "./_shared/runners/cargo.js";

const RUST_LIB_DIR = "playground/rust-lib";
const LIB_PATH = "playground/rust-lib/src/lib.rs";

const PROMPT =
  "There's a borrow error in `playground/rust-lib/src/lib.rs` — `cargo check` fails because a vector is moved into a function and then used again. Fix the function signature to avoid the move without cloning.";

export const meta = {
  id: "SB-49",
  name: "rust-borrow",
  category: "surgical-edit" as const,
  family: "bug-fix" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: RUST_LIB_DIR,
  requires: ["cargo"],
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-49" as ScenarioId,
  name: "rust-borrow",
  category: "surgical-edit",
  family: "bug-fix",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const libPath = join(playgroundDir, LIB_PATH);
    const lib = await readOrEmpty(libPath);

    const rustLibDir = join(playgroundDir, RUST_LIB_DIR);
    const checkResult = await cargoCheck(rustLibDir);

    const changed = changedPaths(toolCalls);
    const onlyLibChanged =
      changed.length > 0 && changed.every((p) => p === LIB_PATH || p.endsWith("lib.rs"));

    const noClone = !/\.clone\s*\(\s*\)/.test(lib);
    const usesSliceOrRef = /total_length\s*\(\s*(?:words\s*:\s*)?&/.test(lib) ||
      /fn\s+total_length\s*\(\s*\w+\s*:\s*&/.test(lib);
    const patternOk = noClone && usesSliceOrRef;

    const changeTurn = firstChangeTurn(toolCalls);
    const ranCargoCheck = bashCalls(toolCalls).some(
      (c) => /cargo\s+check/.test(c.args) && (changeTurn === undefined || c.turn <= changeTurn)
    );

    const noPrintln = !/println!\s*\(/.test(lib);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "cargo check passes",
            pass: checkResult.ok,
            weight: 3,
            detail: checkResult.ok ? undefined : checkResult.stderr,
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
            name: "no .clone() added; changes Vec<String> to &[String] or &Vec<String>",
            pass: patternOk,
            weight: 2,
            detail: patternOk ? undefined : `noClone=${noClone} usesSliceOrRef=${usesSliceOrRef}`,
          },
        ],
        verification: [
          {
            name: "ran cargo check to see the error before fixing",
            pass: ranCargoCheck,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no println! debug macros added",
            pass: noPrintln,
            weight: 2,
          },
        ],
      },
      {
        pass: "Borrow error fixed by changing to slice reference; cargo check passes.",
        partial: "cargo check passes but clone used or scope issues.",
        fail: "cargo check still fails.",
      }
    );
  },
};

export default scenario;
