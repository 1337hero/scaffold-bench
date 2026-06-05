// Hidden authoritative checker for SB-46. Runs from the fixture's __hidden__/
// subdir. Confirms GET /stats counts only the caller's non-deleted items and
// that the reused guard enforces auth.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb, TestDataFactory } from "../tests/helpers";
import type { DB } from "../src/db";

describe("SB-46 hidden: per-user stats", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let factory: TestDataFactory;

  beforeEach(() => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
  });

  test("itemCount is per-user and excludes soft-deleted", async () => {
    const a = await seedUser(db, "a@example.com", "password123");
    const b = await seedUser(db, "b@example.com", "password123");
    const cookieA = await loginCookie(ctx.fetch, "a@example.com", "password123");

    for (let i = 0; i < 7; i++) factory.createItem(a, `a-${i}`);
    factory.createDeletedItem(a, "a-gone");
    for (let i = 0; i < 3; i++) factory.createItem(b, `b-${i}`);

    const res = await ctx.fetch("/stats", { headers: { cookie: cookieA } });
    expect(res.status).toBe(200);
    expect((await res.json<{ itemCount: number }>()).itemCount).toBe(7);
  });

  test("unauthenticated → 401 via the reused guard", async () => {
    const res = await ctx.fetch("/stats");
    expect(res.status).toBe(401);
  });
});
