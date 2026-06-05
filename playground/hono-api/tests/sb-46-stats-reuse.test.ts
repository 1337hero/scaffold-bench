import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb, TestDataFactory } from "./helpers";
import type { DB } from "../src/db";

/**
 * SB-46: GET /stats returns the authenticated user's non-deleted item count,
 * reusing the existing requireUser guard.
 */
describe("SB-46: per-user stats endpoint", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let userId: number;
  let cookie: string;
  let factory: TestDataFactory;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
    userId = await seedUser(db, "owner@example.com", "password123");
    cookie = await loginCookie(ctx.fetch, "owner@example.com", "password123");
  });

  test("counts only the user's non-deleted items", async () => {
    factory.createItem(userId, "a");
    factory.createItem(userId, "b");
    factory.createDeletedItem(userId, "gone");
    const other = await seedUser(db, "other@example.com", "password123");
    factory.createItem(other, "theirs");

    const res = await ctx.fetch("/stats", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{ itemCount: number }>();
    expect(body.itemCount).toBe(2);
  });

  test("zero items → itemCount 0", async () => {
    const res = await ctx.fetch("/stats", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect((await res.json<{ itemCount: number }>()).itemCount).toBe(0);
  });

  test("unauthenticated → 401", async () => {
    const res = await ctx.fetch("/stats");
    expect(res.status).toBe(401);
  });
});
