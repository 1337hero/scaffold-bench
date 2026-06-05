// Hidden authoritative checker for SB-38. Runs from the fixture's __hidden__/
// subdir. Hammers POST /items with a repeated Idempotency-Key and asserts
// exactly one row is created, the id is stable, and keys are per-user scoped.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb } from "../tests/helpers";
import type { DB } from "../src/db";

describe("SB-38 hidden: POST /items idempotency", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let userId: number;
  let cookie: string;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    if (db.query("SELECT name FROM sqlite_master WHERE name='idempotency_keys'").get()) {
      db.exec("DELETE FROM idempotency_keys");
    }
    userId = await seedUser(db, "owner@example.com", "password123");
    cookie = await loginCookie(ctx.fetch, "owner@example.com", "password123");
  });

  const post = (name: string, key: string, c = cookie) =>
    ctx.fetch("/items", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: c, "Idempotency-Key": key },
      body: JSON.stringify({ name }),
    });

  const count = (uid: number) =>
    db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM items WHERE owner_id = ?").get(uid)!
      .n;

  test("ten retries with one key → one row, stable id, 200 on repeats", async () => {
    const first = await post("widget", "k1");
    expect(first.status).toBe(201);
    const id = (await first.json<{ id: number }>()).id;

    for (let i = 0; i < 9; i++) {
      const r = await post("widget", "k1");
      expect(r.status).toBe(200);
      expect((await r.json<{ id: number }>()).id).toBe(id);
    }
    expect(count(userId)).toBe(1);
  });

  test("same key across two users stays independent", async () => {
    const otherId = await seedUser(db, "other@example.com", "password123");
    const otherCookie = await loginCookie(ctx.fetch, "other@example.com", "password123");

    await post("a", "dup");
    await post("a", "dup");
    await post("b", "dup", otherCookie);
    await post("b", "dup", otherCookie);

    expect(count(userId)).toBe(1);
    expect(count(otherId)).toBe(1);
  });
});
