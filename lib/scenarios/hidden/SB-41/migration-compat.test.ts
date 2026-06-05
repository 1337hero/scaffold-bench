// Hidden authoritative checker for SB-41. Runs from the fixture's __hidden__/
// subdir, importing the submitted DB layer via ../src. Confirms the additive
// migration: priority column exists with a default, old (priority-free) and new
// (priority-aware) reads/writes both work, and the migration is idempotent.
import { describe, test, expect } from "bun:test";
import { createDb } from "../src/db";
import { runMigrations } from "../src/migrations";

function seedOwner(db: ReturnType<typeof createDb>): number {
  const row = db
    .query<
      { id: number },
      [string, string]
    >("INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id")
    .get("o@example.com", "x");
  return row!.id;
}

function hasColumn(db: ReturnType<typeof createDb>, table: string, col: string): boolean {
  const cols = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === col);
}

describe("SB-41 hidden: additive priority migration", () => {
  test("createDb yields an items table with a priority column", () => {
    const db = createDb(":memory:");
    expect(hasColumn(db, "items", "priority")).toBe(true);
  });

  test("legacy insert without priority still works and defaults to 0", () => {
    const db = createDb(":memory:");
    const owner = seedOwner(db);
    const inserted = db
      .query<
        { id: number },
        [number, string]
      >("INSERT INTO items (owner_id, name) VALUES (?, ?) RETURNING id")
      .get(owner, "legacy");
    const row = db
      .query<{ priority: number }, [number]>("SELECT priority FROM items WHERE id = ?")
      .get(inserted!.id);
    expect(row!.priority).toBe(0);
  });

  test("legacy read that ignores priority still works", () => {
    const db = createDb(":memory:");
    const owner = seedOwner(db);
    db.query("INSERT INTO items (owner_id, name) VALUES (?, ?)").run(owner, "a");
    const rows = db.query<{ id: number; name: string }, []>("SELECT id, name FROM items").all();
    expect(rows.map((r) => r.name)).toEqual(["a"]);
  });

  test("new write with explicit priority persists it", () => {
    const db = createDb(":memory:");
    const owner = seedOwner(db);
    const inserted = db
      .query<
        { id: number },
        [number, string, number]
      >("INSERT INTO items (owner_id, name, priority) VALUES (?, ?, ?) RETURNING id")
      .get(owner, "hot", 5);
    const row = db
      .query<{ priority: number }, [number]>("SELECT priority FROM items WHERE id = ?")
      .get(inserted!.id);
    expect(row!.priority).toBe(5);
  });

  test("runMigrations is idempotent", () => {
    const db = createDb(":memory:");
    expect(() => {
      runMigrations(db);
      runMigrations(db);
    }).not.toThrow();
    expect(hasColumn(db, "items", "priority")).toBe(true);
  });
});
