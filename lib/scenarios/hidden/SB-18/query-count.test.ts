// Hidden authoritative N+1 detector for SB-18. Runs from the fixture's
// __hidden__/ subdir, so it imports the submitted app via ../src.
// Instruments db.query to count SQL statements issued by GET /items: a JOIN
// fix is O(1), the original per-row loop is O(N).
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb, TestDataFactory } from "../tests/helpers";
import type { DB } from "../src/db";

function countQueriesDuring<T>(
  db: DB,
  fn: () => Promise<T>
): Promise<{ result: T; count: number }> {
  const original = (db as unknown as { query: (...a: unknown[]) => unknown }).query;
  let count = 0;
  (db as unknown as { query: (...a: unknown[]) => unknown }).query = function (...args: unknown[]) {
    count++;
    return original.apply(db, args);
  };
  return fn()
    .then((result) => ({ result, count }))
    .finally(() => {
      (db as unknown as { query: (...a: unknown[]) => unknown }).query = original;
    });
}

describe("SB-18 hidden: GET /items query count", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let cookie: string;
  let factory: TestDataFactory;
  let ownerId: number;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
    ownerId = await seedUser(db, "owner@example.com", "password123");
    cookie = await loginCookie(ctx.fetch, "owner@example.com", "password123");
  });

  test("query count stays O(1) as item count grows (no N+1)", async () => {
    for (let i = 0; i < 60; i++) factory.createItem(ownerId, `item-${i}`);

    const { result, count } = await countQueriesDuring(db, () =>
      ctx.fetch("/items", { headers: { cookie } })
    );

    expect(result.status).toBeLessThan(300);
    // JOIN: ~2 (auth lookup + items). N+1: 1 + 60 per-row owner lookups.
    expect(count).toBeLessThanOrEqual(5);
  });

  test("owner_email still correct under the JOIN", async () => {
    const id = factory.createItem(ownerId, "joined");
    const res = await ctx.fetch("/items", { headers: { cookie } });
    const { items } = await res.json<{ items: Array<{ id: number; owner_email: string }> }>();
    expect(items.find((i) => i.id === id)?.owner_email).toBe("owner@example.com");
  });
});
