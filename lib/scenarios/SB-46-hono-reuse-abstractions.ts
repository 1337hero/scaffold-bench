import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { noConsoleLog, readOrEmpty, onlyChangedFiles } from "./_shared/helpers.js";
import { runHiddenTests, importsOf } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/stats-reuse-abstractions.md and implement it. The building blocks already exist in this codebase — reuse them instead of reinventing auth, the DB type, or error handling. You can run the public tests at playground/hono-api/tests/sb-46-stats-reuse.test.ts.`;

export const meta = {
  id: "SB-46",
  name: "hono-reuse-abstractions",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-46" as ScenarioId,
  name: "hono-reuse-abstractions",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const statsPath = join(fixtureDir, "src/routes/stats.ts");

    // Behavioral signal: hidden tests assert per-user counts (excluding
    // soft-deleted) and that the reused guard enforces auth.
    const hidden = await runHiddenTests("SB-46", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const stats = await readOrEmpty(statsPath);
    const index = await readOrEmpty(join(fixtureDir, "src/index.ts"));
    const statsExists = stats.length > 0;

    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("stats-reuse-abstractions.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: ["playground/hono-api/src/routes/stats.ts", "playground/hono-api/src/index.ts"],
    });

    const imports = statsExists ? importsOf(statsPath) : [];
    // Reuse signal: pull guard + DB type from the existing modules.
    const reusesAuthGuard =
      imports.some((m) => m.endsWith("lib/auth")) && /\brequireUser\b/.test(stats);
    const reusesDbType = imports.some((m) => /\.\.?\/db$/.test(m)) && /\bDB\b/.test(stats);
    // Anti-pattern: re-querying the sessions table / re-validating the cookie.
    const noInlineAuth = !/FROM\s+sessions/i.test(stats) && !/getCookie/.test(stats);
    // Anti-pattern: declaring a private DB type instead of importing it.
    const noRedeclaredDbType = !/type\s+DB\b|interface\s+DB\b/.test(stats);
    const mountedInIndex = /statsRoutes/.test(index) && /app\.route\(/.test(index);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "stats behavior test passes",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "only created stats.ts and edited index.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "reuses requireUser from lib/auth", pass: reusesAuthGuard, weight: 0.75 },
          { name: "imports DB type from db.ts (not redeclared)", pass: reusesDbType && noRedeclaredDbType, weight: 0.5 },
          { name: "no inline session/cookie re-validation", pass: noInlineAuth, weight: 0.5 },
          { name: "mounted statsRoutes in index.ts", pass: mountedInIndex, weight: 0.25 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          {
            name: "filters deleted_at IS NULL",
            pass: /deleted_at\s+IS\s+NULL/i.test(stats),
            weight: 1,
          },
          { name: "no console.log in new route", pass: noConsoleLog(stats), weight: 1 },
        ],
      },
      {
        pass: "Reused the existing guard and DB type; per-user stats correct.",
        partial: "Works but reimplemented auth or the DB type.",
        fail: "Did not reuse the existing abstractions correctly.",
      }
    );
  },
};

export default scenario;
