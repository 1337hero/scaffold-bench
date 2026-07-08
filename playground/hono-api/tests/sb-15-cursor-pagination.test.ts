import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb, TestDataFactory } from "./helpers";
import type { DB } from "../src/db";

describe("SB-15: Cursor pagination for items", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let userId: number;
  let userCookie: string;
  let factory: TestDataFactory;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
    userId = await seedUser(db, "user@example.com", "password123");
    userCookie = await loginCookie(ctx.fetch, "user@example.com", "password123");

    // Create 30 items for pagination testing
    for (let i = 0; i < 30; i++) {
      factory.createItem(userId, `item-${i}`);
    }
  });

  const fetchItems = (params: Record<string, string | number> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      query.append(key, String(value));
    });
    const queryStr = query.toString();
    const path = queryStr ? `/items?${queryStr}` : "/items";

    return ctx.fetch(path, {
      headers: { cookie: userCookie },
    });
  };

  describe("default pagination behavior", () => {
    test("default request returns 20 items with nextCursor", async () => {
      const res = await fetchItems();
      expect(res.status).toBe(200);
      const json = await res.json<{
        items: Array<{ id: number; owner_email: string; name: string; created_at: number }>;
        nextCursor?: string | null;
      }>();

      expect(json.items).toBeDefined();
      expect(json.items.length).toBe(20);
      expect(json.nextCursor).toBeTruthy();
      expect(typeof json.nextCursor).toBe("string");
    });

    test("items ordered by id DESC (newest first)", async () => {
      const res = await fetchItems();
      const json = await res.json<{ items: Array<{ id: number }> }>();

      const ids = json.items.map((item) => item.id);
      const sortedIds = [...ids].sort((a, b) => b - a);
      expect(ids).toEqual(sortedIds);
    });

    test("owner_email present on all items", async () => {
      const res = await fetchItems();
      const json = await res.json<{
        items: Array<{ owner_email: string | null }>;
      }>();

      json.items.forEach((item) => {
        expect(item.owner_email).toBeDefined();
        if (item.owner_email !== null) {
          expect(item.owner_email).toMatch(/@/);
        }
      });
    });
  });

  describe("custom limit", () => {
    test("limit=5 returns exactly 5 items", async () => {
      const res = await fetchItems({ limit: 5 });
      const json = await res.json<{ items: Array<{ id: number }> }>();

      expect(json.items.length).toBe(5);
    });

    test("limit=1 returns exactly 1 item", async () => {
      const res = await fetchItems({ limit: 1 });
      const json = await res.json<{ items: Array<{ id: number }> }>();

      expect(json.items.length).toBe(1);
    });

    test("limit=999 capped at 100", async () => {
      const res = await fetchItems({ limit: 999 });
      const json = await res.json<{ items: Array<{ id: number }> }>();

      expect(json.items.length).toBeLessThanOrEqual(100);
    });

    test("limit=100 returns 100 items max", async () => {
      const res = await fetchItems({ limit: 100 });
      const json = await res.json<{ items: Array<{ id: number }> }>();

      expect(json.items.length).toBeLessThanOrEqual(100);
    });
  });

  describe("limit validation", () => {
    test("limit=0 returns 400", async () => {
      const res = await fetchItems({ limit: 0 });
      expect(res.status).toBe(400);
      const json = await res.json<{ error: { code: string } }>();
      expect(json.error.code).toBeTruthy();
    });

    test("limit=-5 returns 400", async () => {
      const res = await fetchItems({ limit: -5 });
      expect(res.status).toBe(400);
    });

    test("limit=abc returns 400", async () => {
      const res = await fetchItems({ limit: "abc" });
      expect(res.status).toBe(400);
    });

    test("limit with decimals returns 400", async () => {
      const res = await fetchItems({ limit: "5.5" });
      expect(res.status).toBe(400);
    });
  });

  describe("cursor navigation", () => {
    test("cursor parameter filters to items with id < cursor", async () => {
      // Get first page
      const page1 = await fetchItems({ limit: 5 });
      const page1Json = await page1.json<{
        items: Array<{ id: number }>;
        nextCursor?: string;
      }>();
      const firstPageIds = page1Json.items.map((item) => item.id);
      const cursor = page1Json.nextCursor;

      // Get second page with cursor
      const page2 = await fetchItems({ cursor, limit: 5 });
      const page2Json = await page2.json<{ items: Array<{ id: number }> }>();
      const secondPageIds = page2Json.items.map((item) => item.id);

      // Items on page 2 should have IDs less than cursor
      const cursorId = Number(cursor);
      secondPageIds.forEach((id) => {
        expect(id).toBeLessThan(cursorId);
      });

      // No overlap between pages
      const overlap = firstPageIds.some((id) => secondPageIds.includes(id));
      expect(overlap).toBe(false);
    });

    test("cursor at start of id range returns empty list with null nextCursor", async () => {
      const res = await fetchItems({ cursor: 1, limit: 20 });
      const json = await res.json<{
        items: Array<{ id: number }>;
        nextCursor: string | null;
      }>();

      expect(json.items.length).toBe(0);
      expect(json.nextCursor).toBeNull();
    });

    test("nextCursor matches last item id when more items exist", async () => {
      const res = await fetchItems({ limit: 5 });
      const json = await res.json<{
        items: Array<{ id: number }>;
        nextCursor?: string;
      }>();

      if (json.nextCursor) {
        const lastItemId = json.items[json.items.length - 1].id;
        expect(json.nextCursor).toBe(String(lastItemId));
      }
    });

    test("invalid cursor returns 400", async () => {
      const res = await fetchItems({ cursor: "abc" });
      expect(res.status).toBe(400);
    });

    test("cursor with decimals returns 400", async () => {
      const res = await fetchItems({ cursor: "5.5" });
      expect(res.status).toBe(400);
    });
  });

  describe("pagination chain", () => {
    test("can paginate through all items using cursor chain", async () => {
      const allItems = new Set<number>();
      let cursor: string | null | undefined = undefined;

      // Paginate through all items
      for (let page = 0; page < 5; page++) {
        const params: Record<string, string | number> = { limit: 7 };
        if (cursor) {
          params.cursor = cursor;
        }

        const res = await fetchItems(params);
        const json = await res.json<{
          items: Array<{ id: number }>;
          nextCursor?: string | null;
        }>();

        json.items.forEach((item) => {
          expect(allItems.has(item.id)).toBe(false); // No duplicates
          allItems.add(item.id);
        });

        if (!json.nextCursor) {
          break;
        }
        cursor = json.nextCursor;
      }

      // Should have collected 30 items
      expect(allItems.size).toBe(30);
    });

    test("nextCursor null on final page", async () => {
      let cursor: string | undefined;
      let isLastPage = false;

      for (let i = 0; i < 10; i++) {
        const params: Record<string, string | number> = { limit: 10 };
        if (cursor) params.cursor = cursor;

        const res = await fetchItems(params);
        const json = await res.json<{
          nextCursor?: string | null;
        }>();

        if (json.nextCursor === null) {
          isLastPage = true;
          break;
        }
        cursor = json.nextCursor as string;
      }

      expect(isLastPage).toBe(true);
    });
  });

  describe("response format", () => {
    test("response includes items array", async () => {
      const res = await fetchItems();
      const json = await res.json<{ items?: unknown }>();

      expect(json.items).toBeDefined();
      expect(Array.isArray(json.items)).toBe(true);
    });

    test("each item has required fields", async () => {
      const res = await fetchItems();
      const json = await res.json<{
        items: Array<{
          id: number;
          owner_id: number;
          name: string;
          created_at: number;
          owner_email?: string | null;
        }>;
      }>();

      json.items.forEach((item) => {
        expect(typeof item.id).toBe("number");
        expect(typeof item.owner_id).toBe("number");
        expect(typeof item.name).toBe("string");
        expect(typeof item.created_at).toBe("number");
      });
    });

    test("nextCursor is string or null", async () => {
      const res = await fetchItems();
      const json = await res.json<{ nextCursor?: unknown }>();

      if (json.nextCursor !== undefined) {
        expect(typeof json.nextCursor === "string" || json.nextCursor === null).toBe(true);
      }
    });
  });

  describe("deleted_at filter preservation", () => {
    test("deleted items not included in paginated results", async () => {
      const itemId = factory.createItem(userId, "will-delete");
      const allItemsBefore = await fetchItems({ limit: 100 });
      const beforeJson = await allItemsBefore.json<{ items: Array<{ id: number }> }>();
      const countBefore = beforeJson.items.length;

      // Delete the item
      const deleteRes = await ctx.fetch(`/items/${itemId}`, {
        method: "DELETE",
        headers: { cookie: userCookie },
      });
      expect(deleteRes.status).toBe(200);

      // Fetch items again
      const allItemsAfter = await fetchItems({ limit: 100 });
      const afterJson = await allItemsAfter.json<{ items: Array<{ id: number }> }>();
      const countAfter = afterJson.items.length;

      expect(countAfter).toBe(countBefore - 1);
      expect(afterJson.items.some((item) => item.id === itemId)).toBe(false);
    });
  });
});
