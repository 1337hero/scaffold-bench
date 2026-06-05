import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import { PLAYGROUND_SRC, noConsoleLog, readOrEmpty, onlyChangedFiles } from "./_shared/helpers.js";
import { runHiddenTests } from "./_shared/evaluators/index.js";
import { readFile } from "node:fs/promises";

const PROMPT = `Read the spec at playground/hono-api/specs/items-priority-migration.md and implement it. Add the column via an idempotent startup migration without editing schema.sql or breaking existing reads/writes. You can run the public tests at playground/hono-api/tests/sb-41-migration.test.ts.`;

export const meta = {
  id: "SB-41",
  name: "hono-additive-migration",
  category: "implementation" as const,
  family: "spec-impl" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/hono-api/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-41" as ScenarioId,
  name: "hono-additive-migration",
  category: "implementation",
  family: "spec-impl",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const fixtureDir = join(playgroundDir, "playground/hono-api");
    const ORIG = join(PLAYGROUND_SRC, "hono-api");

    // Behavioral signal: hidden tests assert the column exists with a default,
    // old + new reads/writes both work, and the migration is idempotent.
    const hidden = await runHiddenTests("SB-41", fixtureDir);
    const correct = hidden.total > 0 && hidden.rate === 1;

    const migrations = await readOrEmpty(join(fixtureDir, "src/migrations.ts"));
    const db = await readOrEmpty(join(fixtureDir, "src/db.ts"));
    const schema = await readOrEmpty(join(fixtureDir, "schema.sql"));
    const origSchema = await readFile(join(ORIG, "schema.sql"), "utf-8").catch(() => "");

    const readSpec = toolCalls.some(
      (c) => c.name === "read" && c.args.includes("items-priority-migration.md")
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [
        "playground/hono-api/src/migrations.ts",
        "playground/hono-api/src/db.ts",
      ],
    });

    const usesAlter = /ALTER\s+TABLE\s+items\s+ADD\s+COLUMN/i.test(migrations);
    const idempotentGuard = /PRAGMA\s+table_info|table_info\(/i.test(migrations);
    const calledFromCreateDb = /runMigrations\s*\(/.test(db);
    const schemaUntouched = schema === origSchema;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "migration adds column; old+new I/O works; idempotent",
            pass: correct,
            weight: 3,
            detail: `${hidden.passed}/${hidden.total} hidden assertions passed`,
          },
        ],
        scope: [
          {
            name: "only created migrations.ts and edited db.ts",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          { name: "additive ALTER TABLE ... ADD COLUMN", pass: usesAlter, weight: 0.75 },
          { name: "idempotent (checks table_info before adding)", pass: idempotentGuard, weight: 0.75 },
          { name: "wired runMigrations into createDb", pass: calledFromCreateDb, weight: 0.5 },
        ],
        verification: [{ name: "read the spec file", pass: readSpec, weight: 1 }],
        cleanup: [
          { name: "did not edit schema.sql", pass: schemaUntouched, weight: 1 },
          { name: "no console.log added", pass: noConsoleLog(migrations) && noConsoleLog(db), weight: 1 },
        ],
      },
      {
        pass: "Idempotent additive migration; backward-compatible reads/writes preserved.",
        partial: "Column added but migration not idempotent or breaks legacy I/O.",
        fail: "Did not add the column compatibly.",
      }
    );
  },
};

export default scenario;
