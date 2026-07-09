import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readFileSync, existsSync, renameSync } from "node:fs";

const DEFAULT_DB_PATH = join(import.meta.dir, "../../scaffold-bench.db");
const DEFAULT_V1_ARCHIVE_PATH = join(import.meta.dir, "../../scaffold-bench.v1.db");

let _db: Database | null = null;
let _dbPath: string | null = null;

function dbPath(): string {
  return Bun.env.SCAFFOLD_DB_PATH ?? DEFAULT_DB_PATH;
}

function v1ArchivePath(): string {
  return Bun.env.SCAFFOLD_V1_ARCHIVE_PATH ?? DEFAULT_V1_ARCHIVE_PATH;
}

export function getDb(): Database {
  const path = dbPath();
  if (_db && _dbPath !== path) {
    _db.close();
    _db = null;
  }
  if (!_db) {
    _db = new Database(path, { create: true });
    _dbPath = path;
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
    if (!existsSync(v1ArchivePath())) {
      _db?.close();
      _db = null;
      _dbPath = null;
      try {
        renameSync(dbPath(), v1ArchivePath());
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

  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: "001_initial",
      sql: readFileSync(join(import.meta.dir, "schema.sql"), "utf8"),
    },
    {
      name: "002_oneshot",
      sql: readFileSync(join(import.meta.dir, "oneshot-schema.sql"), "utf8"),
    },
    {
      name: "005_runs_harness",
      sql: readFileSync(join(import.meta.dir, "migrations", "005_runs_harness.sql"), "utf8"),
    },
    {
      name: "006_relax_family_check",
      sql: readFileSync(join(import.meta.dir, "migrations", "006_relax_family_check.sql"), "utf8"),
    },
    {
      name: "007_artifacts",
      sql: readFileSync(join(import.meta.dir, "migrations", "007_artifacts.sql"), "utf8"),
    },
    {
      name: "008_oneshot_per_prompt",
      sql: readFileSync(join(import.meta.dir, "migrations", "008_oneshot_per_prompt.sql"), "utf8"),
    },
    {
      name: "009_verify_metrics",
      sql: readFileSync(join(import.meta.dir, "migrations", "009_verify_metrics.sql"), "utf8"),
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    try {
      db.exec(migration.sql);
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

export function closeDb(): void {
  _db?.close();
  _db = null;
  _dbPath = null;
}
