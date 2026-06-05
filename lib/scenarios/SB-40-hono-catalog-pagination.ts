import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { noConsoleLog, readOrEmpty, onlyChangedFiles } from "./_shared/helpers.js";
import { runHiddenTests, importsOf } from "./_shared/evaluators/index.js";

const PROMPT = `Read the spec at playground/hono-api/specs/catalog-list.md and implement it. Follow the patterns already established in playground/hono-api/ and reuse the existing auth guard and DB type. You can run the public tests at playground/hono-api/tests/sb-40-catalog-list.test.ts.`;

export const meta = {
  id: "SB-40",
  name: "hono-catalog-pagination",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-40" as ScenarioId,
  name: "hono-catalog-pagination",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const catalogPath = join(fixtureDir, "src/routes/catalog.ts");

    // Behavioral signal: hidden tests assert keyset pagination invariants
    // (no overlap/gaps, stable order per sort, limit cap, per-user scoping).
    const hidden = await runHiddenTests("SB-40", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const catalog = await readOrEmpty(catalogPath);
    const index = await readOrEmpty(join(fixtureDir, "src/index.ts"));
    const catalogExists = catalog.length > 0;

    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("catalog-list.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [
        "playground/hono-api/src/routes/catalog.ts",
        "playground/hono-api/src/index.ts",
      ],
    });

    const imports = catalogExists ? importsOf(catalogPath) : [];
    const reusesAuthGuard =
      imports.some((m) => m.endsWith("lib/auth")) && /\brequireUser\b/.test(catalog);
    const reusesDbType = imports.some((m) => /\.\.?\/db$/.test(m)) && /\bDB\b/.test(catalog);
    const noInlineAuth = !/FROM\s+sessions/i.test(catalog) && !/getCookie/.test(catalog);
    const mountedInIndex = /catalogRoutes/.test(index) && /app\.route\(/.test(index);
    // Keyset (cursor) pagination, not OFFSET; parameterized SQL.
    const usesKeyset = /\bid\s*[<>]\s*\?/.test(catalog) && !/\bOFFSET\b/i.test(catalog);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "catalog pagination invariants hold",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "only created catalog.ts and edited index.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "reuses requireUser from lib/auth", pass: reusesAuthGuard, weight: 0.75 },
          { name: "imports DB type from db.ts", pass: reusesDbType, weight: 0.5 },
          { name: "keyset pagination (cursor, no OFFSET)", pass: usesKeyset, weight: 0.5 },
          { name: "mounted catalogRoutes in index.ts", pass: mountedInIndex, weight: 0.25 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          {
            name: "filters deleted_at IS NULL + no inline auth",
            pass: /deleted_at\s+IS\s+NULL/i.test(catalog) && noInlineAuth,
            weight: 1,
          },
          { name: "no console.log in new route", pass: noConsoleLog(catalog), weight: 1 },
        ],
      },
      {
        pass: "Keyset pagination with filter/sort; no overlaps or gaps; reused abstractions.",
        partial: "Lists items but pagination or scoping is off.",
        fail: "Did not implement correct cursor pagination.",
      }
    );
  },
};

export default scenario;
