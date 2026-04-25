import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const DB_PATH = join(import.meta.dir, "../../scaffold-bench.db");

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
    db.exec(migration.sql);
    db.run("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [
      migration.name,
      Date.now(),
    ]);
  }
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}
