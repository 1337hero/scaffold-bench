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
} from "./_shared/helpers.js";

const TSC_COMMAND = "bunx tsc --noEmit -p playground/sb43-paths/tsconfig.json";
const TSC_BIN = join(PLAYGROUND_SRC, "..", "node_modules", ".bin", "tsc");

const PROMPT = `playground/sb43-paths fails to type-check: src/main.ts imports "@utils/math" but tsc can't resolve the path alias. Fix the path-alias configuration in playground/sb43-paths/tsconfig.json so the "@utils/*" import resolves. Keep the alias (do not rewrite the import to a relative path) and do not weaken strictness. Verify the failure first, then verify the fix with: ${TSC_COMMAND}`;

export const meta = {
  id: "SB-43",
  name: "tsconfig-path-alias",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sb43-paths/",
  prompt: PROMPT,
} as const;

function runTsc(playgroundDir: string): { pass: boolean; output: string } {
  const result = Bun.spawnSync([TSC_BIN, "--noEmit", "-p", "playground/sb43-paths/tsconfig.json"], {
    cwd: playgroundDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    pass: result.exitCode === 0,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

const scenario: Scenario = {
  id: "SB-43" as ScenarioId,
  name: "tsconfig-path-alias",
  category: "verify-and-repair",
  family: "regression",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const base = "playground/sb43-paths";
    const tsconfig = await readFile(join(playgroundDir, base, "tsconfig.json"), "utf-8").catch(
      () => ""
    );
    const main = await readFile(join(playgroundDir, base, "src/main.ts"), "utf-8").catch(() => "");
    const origMain = await readFile(join(PLAYGROUND_SRC, "sb43-paths/src/main.ts"), "utf-8").catch(
      () => ""
    );

    // Behavioral signal: the project type-checks (alias resolves) → exit 0.
    const tsc = runTsc(playgroundDir);

    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${base}/tsconfig.json`],
    });

    // Kept the alias: didn't "fix" it by switching to a relative import.
    const keptAlias = /@utils\/math/.test(main) && main === origMain;
    const didNotWeakenStrict = /"strict"\s*:\s*true/.test(tsconfig);
    const fixedPaths = /"@utils\/\*"\s*:\s*\[[^\]]*src\/utils/.test(tsconfig);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "tsc --noEmit exits 0 (alias resolves)",
            pass: tsc.pass,
            weight: 3,
            detail: tsc.pass ? undefined : tsc.output,
          },
        ],
        scope: [
          {
            name: "edited only tsconfig.json",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "kept the @utils alias (no relative-import workaround)",
            pass: keptAlias,
            weight: 1,
          },
          { name: "corrected the paths mapping to src/utils", pass: fixedPaths, weight: 0.5 },
          { name: "did not weaken strict mode", pass: didNotWeakenStrict, weight: 0.5 },
        ],
        verification: [
          {
            name: "verified the failure before editing",
            pass: failedVerificationBeforeChange(bashRuns, changeTurn, /tsc\b/),
            weight: 0.5,
          },
          {
            name: "reran tsc after the fix and it passed",
            pass: passedVerificationAfterChange(bashRuns, changeTurn, /tsc\b/),
            weight: 0.5,
          },
        ],
        cleanup: [
          {
            name: "left source files untouched",
            pass: main === origMain,
            weight: 2,
          },
        ],
      },
      {
        pass: "Corrected the path-alias mapping; tsc passes, alias and strictness preserved.",
        partial: "Compiles but via a workaround (relative import / weakened config).",
        fail: "Did not resolve the alias cleanly.",
      }
    );
  },
};

export default scenario;
