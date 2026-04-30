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
  const db = getDb();
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
      // Clear applied set since we're on a fresh DB
      applied.clear();
    }
  }

  // For fresh DBs: 001_initial creates the full v2 schema directly.
  // 002_oneshot creates oneshot tables.
  // 003 and 004 are only for v1→v2 upgrade path (they modify/drop v1 tables).
  // Since v1 upgrade archives the DB and starts fresh, only 001+002 are needed.
  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: "001_initial",
      sql: readFileSync(join(import.meta.dir, "schema.sql"), "utf8"),
    },
    {
      name: "002_oneshot",
      sql: readFileSync(join(import.meta.dir, "oneshot-schema.sql"), "utf8"),
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
}
