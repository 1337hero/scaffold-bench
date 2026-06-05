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
  noAddedComments,
  noConsoleLog,
  onlyChangedFiles,
  passedVerificationAfterChange,
  stripComments,
} from "./_shared/helpers.js";

const TSC_COMMAND = "bunx tsc --noEmit -p playground/sb42-strict/tsconfig.json";

const PROMPT = `playground/sb42-strict/prices.ts fails to type-check under strict mode (noUncheckedIndexedAccess). Fix the type errors by handling the possibly-undefined lookups properly. Do NOT use \`as any\`, \`!\` non-null assertions, \`@ts-ignore\`, or loosen tsconfig.json. Verify the failure first, then verify the fix passes with: ${TSC_COMMAND}`;

export const meta = {
  id: "SB-42",
  name: "tsc-strict-fix",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sb42-strict/",
  prompt: PROMPT,
} as const;

const TSC_BIN = join(PLAYGROUND_SRC, "..", "node_modules", ".bin", "tsc");

/** Real `tsc --noEmit` against the submitted fixture: pass = exit code 0. */
function runTsc(playgroundDir: string): { pass: boolean; output: string } {
  const result = Bun.spawnSync(
    [TSC_BIN, "--noEmit", "-p", "playground/sb42-strict/tsconfig.json"],
    { cwd: playgroundDir, stdout: "pipe", stderr: "pipe" }
  );
  return {
    pass: result.exitCode === 0,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

const scenario: Scenario = {
  id: "SB-42" as ScenarioId,
  name: "tsc-strict-fix",
  category: "verify-and-repair",
  family: "regression",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const pricesPath = join(playgroundDir, "playground/sb42-strict/prices.ts");
    const prices = await readFile(pricesPath, "utf-8").catch(() => "");
    const origPrices = await readFile(join(PLAYGROUND_SRC, "sb42-strict/prices.ts"), "utf-8").catch(
      () => ""
    );
    const tsconfig = await readFile(
      join(playgroundDir, "playground/sb42-strict/tsconfig.json"),
      "utf-8"
    ).catch(() => "");
    const origTsconfig = await readFile(
      join(PLAYGROUND_SRC, "sb42-strict/tsconfig.json"),
      "utf-8"
    ).catch(() => "");

    const code = stripComments(prices);
    // Non-null assertion: `]!`, `ident!.`, `ident!;`, `ident!)` — but not `!=`.
    const nonNullAssertion = /\]\s*!(?!=)|\b[A-Za-z_$][\w$]*!\s*(?=[.;,)\]])/.test(code);
    const noHacks =
      !/as\s+any/.test(code) && !/@ts-ignore|@ts-expect-error/.test(code) && !nonNullAssertion;

    // Behavioral signal: the project type-checks with exit code 0.
    const tsc = runTsc(playgroundDir);

    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/sb42-strict/prices.ts"],
    });

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "tsc --noEmit exits 0 with no type-escape hacks",
            pass: tsc.pass && noHacks,
            weight: 3,
            detail: tsc.pass
              ? noHacks
                ? undefined
                : "compiles but uses a type-escape hack"
              : tsc.output,
          },
        ],
        scope: [
          {
            name: "edited only prices.ts",
            pass: scope.pass,
            weight: 1,
            detail: scope.detail,
          },
          { name: "tsconfig left untouched", pass: tsconfig === origTsconfig, weight: 1 },
        ],
        pattern: [
          { name: "no type-escape hacks (as any / @ts-ignore / !)", pass: noHacks, weight: 1.5 },
          {
            name: "kept exported function signatures",
            pass: /export\s+function/.test(prices),
            weight: 0.5,
          },
        ],
        verification: [
          {
            name: "verified the compile failure before editing",
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
            name: "no unrelated comment churn",
            pass: noAddedComments(prices, origPrices),
            weight: 1,
          },
          { name: "no console.log added", pass: noConsoleLog(prices), weight: 1 },
        ],
      },
      {
        pass: "Handled the undefined lookups; tsc passes with no escape hacks.",
        partial: "Compiles but used a hack, or skipped the verify loop.",
        fail: "Did not get the project type-checking cleanly.",
      }
    );
  },
};

export default scenario;
