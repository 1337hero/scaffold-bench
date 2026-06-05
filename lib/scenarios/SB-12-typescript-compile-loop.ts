import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  TS_COMPILE_COMMAND,
  bashCalls,
  failedVerificationBeforeChange,
  firstChangeTurn,
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
  passedVerificationAfterChange,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-12",
  name: "typescript-compile-loop",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  evaluatorKind: "unit" as const,
  fixturePath: "playground/ts-compile/",
  prompt: `Use TypeScript compile feedback to fix playground/ts-compile/user-summary.ts. Verify the compile failure first, then verify the fix passes with this exact command: ${TS_COMPILE_COMMAND}. Change only what is necessary.`,
} as const;

const scenario: Scenario = {
  id: "SB-12" as ScenarioId,
  name: "typescript-compile-loop",
  category: "verify-and-repair",
  family: "regression",
  prompt: meta.prompt,
  async evaluate({ playgroundDir, toolCalls }) {
    const summaryFile = await readFile(
      join(playgroundDir, "playground/ts-compile/user-summary.ts"),
      "utf-8"
    );
    const originalSummaryFile = await readFile(
      join(PLAYGROUND_SRC, "ts-compile/user-summary.ts"),
      "utf-8"
    );
    const tsconfig = await readFile(
      join(playgroundDir, "playground/ts-compile/tsconfig.json"),
      "utf-8"
    );
    const originalTsconfig = await readFile(
      join(PLAYGROUND_SRC, "ts-compile/tsconfig.json"),
      "utf-8"
    );
    const summaryCode = stripComments(summaryFile);
    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);
    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/ts-compile/user-summary.ts"],
    });

    // Behavioral: actually compile the model's tree with the evaluator's own
    // tsc. Correctness requires a clean compile AND no type-escape, so a fix
    // that merely silences the checker (`as any`, `@ts-ignore`, `!.`) fails
    // even though tsc exits 0.
    const tscBin = join(PLAYGROUND_SRC, "..", "node_modules", ".bin", "tsc");
    const compile = Bun.spawnSync(
      [tscBin, "--noEmit", "-p", "playground/ts-compile/tsconfig.json"],
      { cwd: playgroundDir, stdout: "pipe", stderr: "pipe" }
    );
    const compiles = compile.exitCode === 0;
    const noTypeEscape =
      !/lastSeenAt!\.toISOString\s*\(/.test(summaryCode) &&
      !/as\s+any/.test(summaryCode) &&
      !/@ts-ignore/.test(summaryCode) &&
      !/lastSeenAt\s+as\s+Date/.test(summaryCode);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "compiles cleanly with no type-escape hacks (real tsc --noEmit)",
            pass: summaryFile !== originalSummaryFile && compiles && noTypeEscape,
            weight: 3,
            detail: compiles
              ? undefined
              : compile.stdout.toString() + "\n" + compile.stderr.toString(),
          },
        ],
        scope: [
          {
            name: "edited only user-summary.ts",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          { name: "compile config left untouched", pass: tsconfig === originalTsconfig, weight: 1 },
        ],
        pattern: [
          {
            name: "no type-escape hacks used",
            pass: !/as\s+any/.test(summaryCode) && !/@ts-ignore/.test(summaryCode),
            weight: 1,
          },
          { name: "kept existing export shape", pass: /export\s+/.test(summaryFile), weight: 1 },
        ],
        verification: [
          {
            name: "verified the compile failure before changing code",
            pass: failedVerificationBeforeChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
            weight: 0.5,
          },
          {
            name: "reran compile verification and got a passing result",
            pass: passedVerificationAfterChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
            weight: 0.5,
          },
        ],
        cleanup: [
          {
            name: "no added comments",
            pass: noAddedComments(summaryFile, originalSummaryFile),
            weight: 1,
          },
          { name: "no console.log added", pass: noConsoleLog(summaryFile), weight: 1 },
        ],
      },
      {
        pass: "Observed the TypeScript compile error, fixed it surgically, and verified the compile passed.",
        partial:
          "Fixed the type issue, but skipped either the initial compile failure check or the final passing verification.",
        fail: "Did not complete the TypeScript compile loop correctly.",
      }
    );
  },
};

export default scenario;
