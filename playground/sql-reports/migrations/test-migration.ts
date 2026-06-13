import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

const dir = import.meta.dir;

test("migration 002 applies cleanly to seeded database", () => {
  const db = new Database(":memory:");
  const schema = readFileSync(join(dir, "../schema.sql"), "utf-8");
  const seed = readFileSync(join(dir, "../seed.sql"), "utf-8");
  const migration = readFileSync(join(dir, "002.sql"), "utf-8");

  db.exec(schema);
  db.exec(seed);
  db.exec(migration);

  const rows = db.query("SELECT id, tier FROM clients").all() as { id: number; tier: string }[];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.tier).toBeTruthy();
  }
});
