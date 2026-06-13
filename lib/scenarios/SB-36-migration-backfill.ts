import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  bashCalls,
  bashCommand,
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
  readTurnsForPath,
} from "./_shared/helpers.js";

const PROMPT = `Our database migration \`playground/sql-reports/migrations/002.sql\` crashes when applied to a database with existing client records. It adds a \`tier\` column as NOT NULL but doesn't handle existing rows. Fix the migration so it runs cleanly — existing data should be preserved.`;

export const meta = {
  id: "SB-36",
  name: "migration-backfill",
  category: "verify-and-repair" as const,
  family: "regex-style" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/sql-reports/",
  prompt: PROMPT,
} as const;

function readSync(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function applyMigration(sqlDir: string): { pass: boolean; rows: { id: number; tier: string }[] } {
  try {
    const db = new Database(":memory:");
    db.exec(readSync(join(sqlDir, "schema.sql")));
    db.exec(readSync(join(sqlDir, "seed.sql")));
    db.exec(readSync(join(sqlDir, "migrations/002.sql")));
    const rows = db.query("SELECT id, tier FROM clients").all() as { id: number; tier: string }[];
    return { pass: true, rows };
  } catch {
    return { pass: false, rows: [] };
  }
}

const scenario: Scenario = {
  id: "SB-36" as ScenarioId,
  name: "migration-backfill",
  category: "verify-and-repair",
  family: "regex-style",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const sqlDir = join(playgroundDir, "playground/sql-reports");
    const migPath = join(sqlDir, "migrations/002.sql");

    const migSQL = await readOrEmpty(migPath);
    const { pass: migrationApplied, rows } = applyMigration(sqlDir);

    const allRowsHaveTier = rows.length > 0 && rows.every((r) => r.tier !== null && r.tier !== "");

    const hasDefault = /DEFAULT\s+['"]?\w+['"]?/i.test(migSQL);
    const hasBackfill = /UPDATE\s+clients\s+SET\s+tier/i.test(migSQL);
    const properPattern = hasDefault || hasBackfill;

    const changeTurn = firstChangeTurn(toolCalls);
    const migrationFilePath = "playground/sql-reports/migrations/002.sql";
    const readBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, migrationFilePath).some((t) => t < changeTurn);

    // Check for bash trace showing before/after (synthetic or real)
    const bashes = bashCalls(toolCalls);
    const hasMigrationTrace = bashes.some((c) =>
      /002\.sql|test-migration|migration/i.test(bashCommand(c))
    );

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [migrationFilePath],
    });

    const hasDebugArtifacts = /console\.|--\s*debug|--\s*TODO/i.test(migSQL);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "migration applies without error to seeded database",
            pass: migrationApplied,
            weight: 2,
            detail: migrationApplied ? undefined : "migration threw an error on seeded DB",
          },
          {
            name: "existing client rows have non-null tier after migration",
            pass: allRowsHaveTier,
            weight: 1,
            detail: allRowsHaveTier ? undefined : `rows: ${JSON.stringify(rows.slice(0, 3))}`,
          },
        ],
        scope: [
          {
            name: "only migrations/002.sql changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "uses DEFAULT or UPDATE backfill (proper SQL approach)",
            pass: properPattern,
            weight: 2,
            detail: !properPattern ? "no DEFAULT or UPDATE backfill found" : undefined,
          },
        ],
        verification: [
          {
            name: "bash trace shows migration tested (before/after)",
            pass: hasMigrationTrace || readBeforeEdit,
            weight: 1,
            detail:
              hasMigrationTrace || readBeforeEdit ? undefined : "no migration test trace found",
          },
        ],
        cleanup: [
          {
            name: "no debug artifacts in migration file",
            pass: !hasDebugArtifacts,
            weight: 2,
            detail: hasDebugArtifacts ? "debug artifacts found in migration" : undefined,
          },
        ],
      },
      {
        pass: "Migration backfill fixed; applies cleanly with existing rows preserved.",
        partial: "Migration partially fixed.",
        fail: "Migration still fails on seeded database.",
      }
    );
  },
};

export default scenario;
