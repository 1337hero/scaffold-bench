import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noConsoleLog,
  noAddedComments,
  readOrEmpty,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runHiddenTests, importsOf } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/typed-validation-errors.md and implement it. Follow the patterns already established in playground/hono-api/. You can run the public tests at playground/hono-api/tests/sb-39-typed-validation.test.ts.`;

export const meta = {
  id: "SB-39",
  name: "hono-typed-validation",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-39" as ScenarioId,
  name: "hono-typed-validation",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");
    const usersPath = join(fixtureDir, "src/routes/users.ts");

    // Behavioral signal: hidden tests assert the typed 422 shape, per-field
    // coverage, no row on failure, and 201 on valid input.
    const hidden = await runHiddenTests("SB-39", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const users = await readOrEmpty(usersPath);
    const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8").catch(() => "");
    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("typed-validation-errors.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/hono-api/src/routes/users.ts"],
    });

    const importsZod = users.length > 0 && importsOf(usersPath).includes("zod");
    const usesZodParse = /\.(safeParse|parse)\s*\(/.test(users);
    const buildsFieldMap = /fields/.test(users) && /\.issues|\.error/.test(users);
    // Anti-pattern: hand-rolled "if (!email || !password)" instead of zod.
    const noHandRolledCheck = !/if\s*\(\s*!\s*body\.email/.test(users);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "typed validation behavior test passes",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "only edited src/routes/users.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "imports zod", pass: importsZod, weight: 0.5 },
          { name: "validates via zod parse/safeParse", pass: usesZodParse, weight: 0.75 },
          { name: "derives field map from zod issues", pass: buildsFieldMap, weight: 0.5 },
          { name: "no hand-rolled presence check", pass: noHandRolledCheck, weight: 0.25 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          {
            name: "preserved GET /users/:id handler",
            pass: /usersRoutes\.get\(\s*["'`]\/users\/:id/.test(users),
            weight: 1,
          },
          { name: "no console.log added", pass: noConsoleLog(users), weight: 0.5 },
          {
            name: "no unrelated comment churn",
            pass: noAddedComments(users, origUsers),
            weight: 0.5,
          },
        ],
      },
      {
        pass: "POST /users validates with zod and returns the typed 422 field map.",
        partial: "Validation works but not via zod / wrong shape.",
        fail: "Did not return typed validation errors.",
      }
    );
  },
};

export default scenario;
