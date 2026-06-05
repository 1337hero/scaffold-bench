import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readFileSync, existsSync, renameSync } from "node:fs";

const DB_PATH = join(import.meta.dir, "../../scaffold-bench.db");
const V1_ARCHIVE_PATH = join(import.meta.dir, "../../scaffold-bench.v1.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH, { create: true });
    _db.exec("PRAGMA journal_mode=WAL");
    _db.exec("PRAGMA foreign_keys=ON");
  }
  return _db;
}

export function runMigrations(): void {
  let db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

  const applied = new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM schema_migrations")
      .all()
      .map((r) => r.name)
  );

  // Detect if we're upgrading from v1 schema (has 001_initial but not 004)
  const isV1Upgrade = applied.has("001_initial") && !applied.has("004_v2_fresh_schema");

  if (isV1Upgrade) {
    // Archive the old DB file before the destructive migration
    if (!existsSync(V1_ARCHIVE_PATH)) {
      _db?.close();
      _db = null;
      try {
        renameSync(DB_PATH, V1_ARCHIVE_PATH);
      } catch {
        // If rename fails (e.g., locked), just proceed — DROP TABLE below will work
      }
      // Re-open (creates fresh DB)
      const freshDb = getDb();
      freshDb.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )
      `);
      db = freshDb;
      // Clear applied set since we're on a fresh DB
      applied.clear();
    }
  }

  const migrations: Array<{ name: string; sql?: string; run?: (db: Database) => void }> = [
    {
      name: "001_initial",
      sql: readFileSync(join(import.meta.dir, "schema.sql"), "utf8"),
    },
    {
      name: "002_oneshot",
      sql: readFileSync(join(import.meta.dir, "oneshot-schema.sql"), "utf8"),
    },
    {
      name: "005_scenario_metadata",
      run: applyScenarioMetadata,
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    try {
      if (migration.sql) db.exec(migration.sql);
      migration.run?.(db);
      db.run("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [
        migration.name,
        Date.now(),
      ]);
    } catch (err) {
      console.error(`Migration ${migration.name} failed:`, err);
      throw err;
    }
  }
}

const SCENARIO_METADATA_COLUMNS: Array<{ name: string; def: string }> = [
  { name: "signal_type", def: "signal_type TEXT" },
  { name: "evaluator_kind", def: "evaluator_kind TEXT" },
  { name: "stacks_json", def: "stacks_json TEXT" },
  { name: "task_type", def: "task_type TEXT" },
  { name: "difficulty", def: "difficulty TEXT" },
  { name: "surface", def: "surface TEXT" },
  { name: "hidden_test_passed", def: "hidden_test_passed INTEGER" },
  { name: "hidden_test_total", def: "hidden_test_total INTEGER" },
];

function applyScenarioMetadata(db: Database): void {
  db.exec(readFileSync(join(import.meta.dir, "migrations", "005_scenario_metadata.sql"), "utf8"));

  const existing = new Set(
    db
      .query<{ name: string }, []>("PRAGMA table_info('scenario_runs')")
      .all()
      .map((r) => r.name)
  );

  for (const col of SCENARIO_METADATA_COLUMNS) {
    if (existing.has(col.name)) continue;
    db.exec(`ALTER TABLE scenario_runs ADD COLUMN ${col.def}`);
  }
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
