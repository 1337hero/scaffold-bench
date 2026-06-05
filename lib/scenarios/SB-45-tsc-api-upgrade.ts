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

const TSC_COMMAND = "bunx tsc --noEmit -p playground/sb45-apichange/tsconfig.json";

const PROMPT = `playground/sb45-apichange/src/app.ts no longer type-checks: the SDK in src/sdk.ts was upgraded to v2 with three breaking API changes (documented at the top of sdk.ts). Fix the call sites in app.ts to the new API. Do NOT use \`as any\`, \`!\` non-null assertions, \`@ts-ignore\`, or edit sdk.ts. Verify the failure first, then verify the fix passes with: ${TSC_COMMAND}`;

export const meta = {
  id: "SB-45",
  name: "tsc-api-upgrade",
  category: "verify-and-repair" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sb45-apichange/",
  prompt: PROMPT,
} as const;

const TSC_BIN = join(PLAYGROUND_SRC, "..", "node_modules", ".bin", "tsc");

/** Real `tsc --noEmit` against the submitted fixture: pass = exit code 0. */
function runTsc(playgroundDir: string): { pass: boolean; output: string } {
  const result = Bun.spawnSync(
    [TSC_BIN, "--noEmit", "-p", "playground/sb45-apichange/tsconfig.json"],
    { cwd: playgroundDir, stdout: "pipe", stderr: "pipe" }
  );
  return {
    pass: result.exitCode === 0,
    output: result.stdout.toString() + result.stderr.toString(),
  };
}

const scenario: Scenario = {
  id: "SB-45" as ScenarioId,
  name: "tsc-api-upgrade",
  category: "verify-and-repair",
  family: "regression",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const base = "playground/sb45-apichange";
    const appPath = join(playgroundDir, base, "src/app.ts");
    const app = await readFile(appPath, "utf-8").catch(() => "");
    const origApp = await readFile(join(PLAYGROUND_SRC, "sb45-apichange/src/app.ts"), "utf-8").catch(
      () => ""
    );
    const sdk = await readFile(join(playgroundDir, base, "src/sdk.ts"), "utf-8").catch(() => "");
    const origSdk = await readFile(join(PLAYGROUND_SRC, "sb45-apichange/src/sdk.ts"), "utf-8").catch(
      () => ""
    );

    const code = stripComments(app);
    const nonNullAssertion = /\]\s*!(?!=)|\b[A-Za-z_$][\w$]*!\s*(?=[.;,)\]])/.test(code);
    const noHacks =
      !/as\s+any/.test(code) && !/@ts-ignore|@ts-expect-error/.test(code) && !nonNullAssertion;

    // Behavioral signal: the project type-checks with exit code 0.
    const tsc = runTsc(playgroundDir);

    const changeTurn = firstChangeTurn(toolCalls);
    const bashRuns = bashCalls(toolCalls);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [`${base}/src/app.ts`],
    });

    // Migrated all three API changes (not just silenced errors):
    const usesOptionsObject = /createClient\s*\(\s*\{/.test(code);
    const awaitsFetchUser = /await\s+client\.fetchUser/.test(code);
    const usesSplitName = /firstName/.test(code) && /lastName/.test(code) && !/\.name\b/.test(code);

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
          { name: "edited only app.ts", pass: scope.pass, weight: 1, detail: scope.detail },
          { name: "sdk.ts left untouched", pass: sdk === origSdk && origSdk.length > 0, weight: 1 },
        ],
        pattern: [
          { name: "createClient uses the options object", pass: usesOptionsObject, weight: 0.75 },
          { name: "awaits the now-async fetchUser", pass: awaitsFetchUser, weight: 0.5 },
          { name: "uses firstName/lastName (not the removed name)", pass: usesSplitName, weight: 0.75 },
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
          { name: "no unrelated comment churn", pass: noAddedComments(app, origApp), weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(app), weight: 1 },
        ],
      },
      {
        pass: "Migrated all three API changes; tsc passes with no escape hacks.",
        partial: "Compiles but used a hack, missed a change, or skipped the verify loop.",
        fail: "Did not migrate the call sites cleanly.",
      }
    );
  },
};

export default scenario;
