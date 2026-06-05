// Public smoke test for SB-40. The hidden checker asserts the full pagination
// invariants (no overlap / no gaps, stable order, caps).
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb, TestDataFactory } from "./helpers";
import type { DB } from "../src/db";

describe("SB-40 catalog list (public)", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let factory: TestDataFactory;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
  });

  test("unauthenticated → 401", async () => {
    const res = await ctx.fetch("/catalog");
    expect(res.status).toBe(401);
  });

  test("returns only the caller's non-deleted items", async () => {
    const a = await seedUser(db, "a@example.com", "password123");
    const cookie = await loginCookie(ctx.fetch, "a@example.com", "password123");
    factory.createItem(a, "alpha");
    factory.createDeletedItem(a, "gone");
    const res = await ctx.fetch("/catalog", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { name: string }[] }>();
    expect(body.items.map((i) => i.name)).toEqual(["alpha"]);
  });
});
