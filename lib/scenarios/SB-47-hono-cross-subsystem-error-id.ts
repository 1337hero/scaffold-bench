import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  readOrEmpty,
  onlyChangedFiles,
  stripComments,
} from "./_shared/helpers.js";
import { runHiddenTests } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/error-request-id.md and implement it. This touches a shared module used by every subsystem — keep the existing error.code / error.message contract intact. You can run the public tests at playground/hono-api/tests/sb-47-error-request-id.test.ts.`;

export const meta = {
  id: "SB-47",
  name: "hono-cross-subsystem-error-id",
  category: "implementation" as const,
  family: "regression" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-47" as ScenarioId,
  name: "hono-cross-subsystem-error-id",
  category: "implementation",
  family: "regression",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");
    const errorsPath = join(fixtureDir, "src/lib/errors.ts");

    // Behavioral signal: hidden tests exercise users/sessions/items error paths,
    // asserting the code/message contract is preserved AND requestId was added.
    const hidden = await runHiddenTests("SB-47", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const errors = await readOrEmpty(errorsPath);
    const origErrors = await readFile(join(ORIG, "src/lib/errors.ts"), "utf-8").catch(() => "");
    const code = stripComments(errors);
    const origCode = stripComments(origErrors);

    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("error-request-id.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/hono-api/src/lib/errors.ts"],
    });

    const addsRequestId = /requestId/.test(code);
    // requestId must appear in BOTH branches. Split on the generic-500 marker
    // ("internal server error") so each branch's json body is checked in
    // isolation rather than letting a single id bleed across both branches.
    const splitIdx = code.search(/internal server error/);
    const appErrorBranch = splitIdx >= 0 ? code.slice(0, splitIdx) : code;
    const internalBranch = splitIdx >= 0 ? code.slice(splitIdx) : "";
    const appErrorBranchHasId =
      /err\.code/.test(appErrorBranch) && /requestId/.test(appErrorBranch);
    const internalBranchHasId = /requestId/.test(internalBranch);
    const bothBranches = appErrorBranchHasId && internalBranchHasId;
    // AppError constructor signature unchanged (other code constructs it).
    const constructorIntact =
      /class\s+AppError\s+extends\s+Error/.test(code) &&
      /message:\s*string/.test(code) &&
      /public\s+status/.test(code) &&
      /public\s+code/.test(code);
    // The nested `error: { code, message }` wrapper must be preserved.
    const keptCodeMessage =
      /error:\s*\{[^}]*code:\s*err\.code/.test(code) &&
      /error:\s*\{[^}]*message:\s*err\.message/.test(code);
    // Did not add NEW console.log beyond the original console.error already there.
    const noNewConsole =
      (code.match(/console\.(log|error|warn)\s*\(/g) ?? []).length <=
      (origCode.match(/console\.(log|error|warn)\s*\(/g) ?? []).length;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "cross-subsystem error contract + requestId test passes",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "edited only src/lib/errors.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "adds requestId to error body", pass: addsRequestId, weight: 0.5 },
          { name: "requestId in both error branches", pass: bothBranches, weight: 0.75 },
          { name: "preserved code/message fields", pass: keptCodeMessage, weight: 0.75 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "AppError constructor signature intact", pass: constructorIntact, weight: 1 },
          { name: "no new console logging added", pass: noNewConsole, weight: 0.5 },
          {
            name: "no unrelated comment churn",
            pass: noAddedComments(errors, origErrors),
            weight: 0.5,
          },
        ],
      },
      {
        pass: "Added requestId everywhere; code/message contract and AppError intact.",
        partial: "requestId added but contract or branch coverage incomplete.",
        fail: "Broke the shared error contract or AppError.",
      }
    );
  },
};

export default scenario;
