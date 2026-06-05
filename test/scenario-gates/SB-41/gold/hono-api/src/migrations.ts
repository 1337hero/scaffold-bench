import type { DB } from "./db";

function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

export function runMigrations(db: DB): void {
  if (!hasColumn(db, "items", "priority")) {
    db.exec("ALTER TABLE items ADD COLUMN priority INTEGER NOT NULL DEFAULT 0");
  }
}
