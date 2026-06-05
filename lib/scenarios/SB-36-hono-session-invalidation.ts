import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  noAddedComments,
  noConsoleLog,
  readOrEmpty,
  onlyChangedFiles,
} from "./_shared/helpers.js";
import { runHiddenTests } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/session-invalidation.md and implement it. Follow the patterns already established in playground/hono-api/. You can run the public tests at playground/hono-api/tests/sb-36-session-invalidation.test.ts.`;

export const meta = {
  id: "SB-36",
  name: "hono-session-invalidation",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-36" as ScenarioId,
  name: "hono-session-invalidation",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");

    // Behavioral signal: hidden tests verify the requesting session survives,
    // every other session is revoked, and only the new password authenticates.
    const hidden = await runHiddenTests("SB-36", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const users = await readOrEmpty(join(fixtureDir, "src/routes/users.ts"));
    const origUsers = await readFile(join(ORIG, "src/routes/users.ts"), "utf-8").catch(() => "");
    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("session-invalidation.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/hono-api/src/routes/users.ts"],
    });

    const hasPasswordRoute = /\.post\(\s*["'`]\/users\/:id\/password["'`]/.test(users);
    const usesRequireUser = /requireUser/.test(users);
    const deletesOtherSessions =
      /DELETE\s+FROM\s+sessions/i.test(users) && /token\s*!=\s*\?/.test(users);
    const usesAppError = /AppError/.test(users);
    const hashesNewPassword = /Bun\.password\.hash/.test(users);
    const keptUserGet =
      /\/users\/:id["'`]\s*,\s*\(c\)/.test(users) || /usersRoutes\.get\(/.test(users);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "session-invalidation behavior test passes",
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
          {
            name: "deletes other sessions (keeps current token)",
            pass: deletesOtherSessions,
            weight: 1,
          },
          { name: "guards route with requireUser", pass: usesRequireUser, weight: 0.5 },
          { name: "added POST /users/:id/password route", pass: hasPasswordRoute, weight: 0.25 },
          { name: "hashes the new password", pass: hashesNewPassword, weight: 0.125 },
          { name: "uses AppError for failures", pass: usesAppError, weight: 0.125 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          {
            name: "preserved existing users handlers",
            pass: keptUserGet && /usersRoutes\.post\(\s*["'`]\/users["'`]/.test(users),
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
        pass: "Password change revokes other sessions, keeps current one, new password works.",
        partial: "Endpoint exists but invalidation/auth incomplete.",
        fail: "Did not implement session invalidation correctly.",
      }
    );
  },
};

export default scenario;
