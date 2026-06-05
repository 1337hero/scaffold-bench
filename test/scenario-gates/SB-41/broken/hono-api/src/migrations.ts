import type { DB } from "./db";

// Not idempotent: a bare ALTER that throws if the column already exists.
export function runMigrations(db: DB): void {
  db.exec("ALTER TABLE items ADD COLUMN priority INTEGER NOT NULL DEFAULT 0");
}
