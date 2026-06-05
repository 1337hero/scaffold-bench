// Public smoke test for SB-41. The hidden checker asserts full backward-compat
// and idempotency.
import { describe, test, expect } from "bun:test";
import { createDb } from "../src/db";

describe("SB-41 priority migration (public)", () => {
  test("items has a priority column after createDb", () => {
    const db = createDb(":memory:");
    const cols = db.query<{ name: string }, []>("PRAGMA table_info(items)").all();
    expect(cols.some((c) => c.name === "priority")).toBe(true);
  });

  test("inserting without priority still works", () => {
    const db = createDb(":memory:");
    const owner = db
      .query<{ id: number }, [string, string]>(
        "INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id"
      )
      .get("u@example.com", "x")!.id;
    expect(() =>
      db.query("INSERT INTO items (owner_id, name) VALUES (?, ?)").run(owner, "x")
    ).not.toThrow();
  });
});
