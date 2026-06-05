import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb } from "./helpers";
import type { DB } from "../src/db";

/**
 * SB-38: POST /items is idempotent per (user, Idempotency-Key). A retry with the
 * same key returns the original item (200) and creates no duplicate row.
 */
describe("SB-38: idempotent POST /items", () => {
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

  const create = (name: string, key?: string) =>
    ctx.fetch("/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify({ name }),
    });

  function itemCount(uid: number): number {
    return db
      .query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM items WHERE owner_id = ?")
      .get(uid)!.n;
  }

  test("same key → one row, second response reuses id with 200", async () => {
    const first = await create("widget", "key-abc");
    expect(first.status).toBe(201);
    const firstBody = await first.json<{ id: number; name: string }>();

    const second = await create("widget", "key-abc");
    expect(second.status).toBe(200);
    const secondBody = await second.json<{ id: number; name: string }>();

    expect(secondBody.id).toBe(firstBody.id);
    expect(itemCount(userId)).toBe(1);
  });

  test("no header → always creates (201)", async () => {
    await create("a");
    await create("a");
    expect(itemCount(userId)).toBe(2);
  });

  test("same key, different user → independent items", async () => {
    const otherId = await seedUser(db, "other@example.com", "password123");
    const otherCookie = await loginCookie(ctx.fetch, "other@example.com", "password123");

    await create("mine", "shared-key");
    const res = await ctx.fetch("/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: otherCookie,
        "Idempotency-Key": "shared-key",
      },
      body: JSON.stringify({ name: "theirs" }),
    });
    expect(res.status).toBe(201);
    expect(itemCount(userId)).toBe(1);
    expect(itemCount(otherId)).toBe(1);
  });

  test("three retries still produce exactly one row", async () => {
    await create("x", "retry-key");
    await create("x", "retry-key");
    await create("x", "retry-key");
    expect(itemCount(userId)).toBe(1);
  });
});
