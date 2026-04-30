import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import { checksToEvaluation } from "../scoring.ts";
import type { Scenario } from "./_shared/types.js";
import {
  PLAYGROUND_SRC,
  TS_COMPILE_COMMAND,
  bashCalls,
  failedVerificationBeforeChange,
  firstChangeTurn,
  onlyChangedFiles,
  passedVerificationAfterChange,
  stripComments,
} from "./_shared/helpers.js";

export const meta = {
  id: "SB-15",
  name: "typescript-compile-loop",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  fixturePath: "playground/ts-compile/",
  prompt: `Use TypeScript compile feedback to fix playground/ts-compile/user-summary.ts. Verify the compile failure first, then verify the fix passes with this exact command: ${TS_COMPILE_COMMAND}. Change only what is necessary.`,
} as const;

const scenario: Scenario = {
  id: "SB-15" as ScenarioId,
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

    const checks = [
      {
        name: "verified the compile failure before changing code",
        pass: failedVerificationBeforeChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
      },
      {
        name: "edited only user-summary.ts",
        pass: scope.pass,
        detail: scope.detail,
      },
      {
        name: "user-summary fixes the type issue without type-escape hacks",
        pass:
          summaryFile !== originalSummaryFile &&
          !/lastSeenAt!\.toISOString\s*\(/.test(summaryCode) &&
          !/as\s+any/.test(summaryCode) &&
          !/@ts-ignore/.test(summaryCode) &&
          !/lastSeenAt\s+as\s+Date/.test(summaryCode),
      },
      {
        name: "compile config left untouched",
        pass: tsconfig === originalTsconfig,
      },
      {
        name: "reran compile verification and got a passing result",
        pass: passedVerificationAfterChange(bashRuns, changeTurn, TS_COMPILE_COMMAND),
      },
    ];

    return checksToEvaluation(checks, {
      pass: "Observed the TypeScript compile error, fixed it surgically, and verified the compile passed.",
      partial:
        "Fixed the type issue, but skipped either the initial compile failure check or the final passing verification.",
      fail: "Did not complete the TypeScript compile loop correctly.",
    });
  },
};

export default scenario;
