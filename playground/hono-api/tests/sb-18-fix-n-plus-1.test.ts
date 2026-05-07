import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb, TestDataFactory } from "./helpers";
import type { DB } from "../src/db";

/**
 * SB-18: GET /items must use a single JOIN to fetch owner_email rather than
 * a per-row SELECT. The N+1 spec explicitly says "do not add pagination" —
 * separate ticket — so this oracle validates the simple { items: [...] }
 * shape and the correctness of the joined data, not pagination.
 *
 * Query-count detection is done via a lightweight runtime spy in the test
 * so the oracle catches N+1 without relying on regex alone.
 */
describe("SB-18: Fix N+1 query in GET /items", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let primaryId: number;
  let primaryCookie: string;
  let factory: TestDataFactory;
  const otherIds: number[] = [];

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
    otherIds.length = 0;

    primaryId = await seedUser(db, "primary@example.com", "password123");
    primaryCookie = await loginCookie(ctx.fetch, "primary@example.com", "password123");
    for (let i = 0; i < 5; i++) {
      otherIds.push(await factory.createUser(`user${i}@example.com`));
    }
  });

  const fetchItems = () => ctx.fetch("/items", { headers: { cookie: primaryCookie } });

  describe("response shape", () => {
    test("returns { items: [...] }", async () => {
      factory.createItem(primaryId, "item-1");

      const res = await fetchItems();
      expect(res.status).toBeLessThan(300);
      const json = await res.json<{ items: unknown[] }>();
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThan(0);
    });

    test("each item has id, owner_id, name, created_at, owner_email", async () => {
      factory.createItem(primaryId, "item-1");

      const res = await fetchItems();
      const { items } = await res.json<{
        items: Array<Record<string, unknown>>;
      }>();
      const item = items[0];
      for (const key of ["id", "owner_id", "name", "created_at", "owner_email"]) {
        expect(item).toHaveProperty(key);
      }
    });
  });

  describe("owner_email correctness via JOIN", () => {
    test("owner_email matches the owner's user.email", async () => {
      const owner = otherIds[0];
      const itemId = factory.createItem(owner, "joined-item");
      const ownerEmail = db
        .query<{ email: string }, [number]>("SELECT email FROM users WHERE id = ?")
        .get(owner)!.email;

      const res = await fetchItems();
      const { items } = await res.json<{
        items: Array<{ id: number; owner_email: string | null }>;
      }>();
      const item = items.find((i) => i.id === itemId);
      expect(item?.owner_email).toBe(ownerEmail);
    });

    test("owner_email populated for all items with a valid owner", async () => {
      factory.createItem(primaryId, "a");
      factory.createItem(otherIds[0], "b");
      factory.createItem(otherIds[1], "c");

      const res = await fetchItems();
      const { items } = await res.json<{
        items: Array<{ owner_email: string | null }>;
      }>();
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.owner_email).toBeTruthy();
      }
    });

    test("scales: 50 items across many owners all join correctly", async () => {
      const expected = new Map<number, string>();
      for (let i = 0; i < 50; i++) {
        const owner = i % 6 === 0 ? primaryId : otherIds[i % otherIds.length];
        const id = factory.createItem(owner, `item-${i}`);
        expected.set(
          id,
          db.query<{ email: string }, [number]>("SELECT email FROM users WHERE id = ?").get(owner)!
            .email
        );
      }

      const res = await fetchItems();
      const { items } = await res.json<{
        items: Array<{ id: number; owner_email: string | null }>;
      }>();

      for (const item of items) {
        expect(item.owner_email).toBe(expected.get(item.id) ?? null);
      }
    });
  });

  describe("query count (N+1 detection)", () => {
    test("uses O(1) queries for 50 items (no N+1 per-row lookups)", async () => {
      for (let i = 0; i < 50; i++) {
        factory.createItem(otherIds[i % otherIds.length], `item-${i}`);
      }

      const originalQuery = (db as any).query;
      let queryCallCount = 0;
      (db as any).query = function (...args: unknown[]) {
        queryCallCount++;
        return originalQuery.apply(db, args);
      };

      try {
        await fetchItems();
      } finally {
        (db as any).query = originalQuery;
      }

      // With a JOIN we expect ~2 calls (auth + one JOINed items query).
      // N+1 uses 1 + N per-row lookups, so >50 calls.
      expect(queryCallCount).toBeLessThanOrEqual(5);
    });
  });

  describe("filter and order preserved", () => {
    test("deleted_at IS NULL filter still applied", async () => {
      const active = factory.createItem(primaryId, "active");
      const deleted = factory.createDeletedItem(primaryId, "deleted");

      const res = await fetchItems();
      const { items } = await res.json<{ items: Array<{ id: number }> }>();
      const ids = items.map((i) => i.id);
      expect(ids).toContain(active);
      expect(ids).not.toContain(deleted);
    });

    test("ORDER BY id DESC preserved", async () => {
      for (let i = 0; i < 5; i++) factory.createItem(primaryId, `item-${i}`);

      const res = await fetchItems();
      const { items } = await res.json<{ items: Array<{ id: number }> }>();
      const ids = items.map((i) => i.id);
      const sorted = [...ids].sort((a, b) => b - a);
      expect(ids).toEqual(sorted);
    });
  });
});
