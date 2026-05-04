import { describe, test, expect, beforeEach } from "bun:test";
import {
  testClient,
  seedUser,
  loginCookie,
  cleanupDb,
  queryItems,
  TestDataFactory,
} from "./helpers";
import type { DB } from "../src/db";

describe("SB-17: Soft delete and restore", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let userId: number;
  let otherUserId: number;
  let userCookie: string;
  let factory: TestDataFactory;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
    userId = await seedUser(db, "user@example.com", "password123");
    otherUserId = await seedUser(db, "other@example.com", "password123");
    userCookie = await loginCookie(ctx.fetch, "user@example.com", "password123");
  });

  describe("soft delete creation", () => {
    test("delete endpoint sets deleted_at timestamp", async () => {
      const itemId = factory.createItem(userId, "test-item");

      // Verify item exists with NULL deleted_at
      let item = queryItems(db).find((i) => i.id === itemId);
      expect(item?.deleted_at).toBeNull();

      // Delete item
      const res = await ctx.fetch(`/items/${itemId}`, {
        method: "DELETE",
        headers: { cookie: userCookie },
      });

      expect(res.status).toBe(200);

      // Verify deleted_at is set
      item = queryItems(db).find((i) => i.id === itemId);
      expect(item?.deleted_at).toBeTruthy();
      expect(typeof item?.deleted_at).toBe("number");
    });

    test("deleted item hidden from GET /items", async () => {
      const itemId = factory.createItem(userId, "test-item");

      // Get items before delete
      let res = await ctx.fetch("/items", { headers: { cookie: userCookie } });
      let json = await res.json<{ items: Array<{ id: number }> }>();
      const itemsBefore = json.items.map((i) => i.id);
      expect(itemsBefore).toContain(itemId);

      // Delete item
      await ctx.fetch(`/items/${itemId}`, {
        method: "DELETE",
        headers: { cookie: userCookie },
      });

      // Get items after delete
      res = await ctx.fetch("/items", { headers: { cookie: userCookie } });
      json = await res.json<{ items: Array<{ id: number }> }>();
      const itemsAfter = json.items.map((i) => i.id);
      expect(itemsAfter).not.toContain(itemId);
    });
  });

  describe("restore endpoint", () => {
    test("owner can restore deleted item", async () => {
      const itemId = factory.createDeletedItem(userId, "deleted-item");

      const res = await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });

      expect(res.status).toBe(200);
      const json = await res.json<{ ok: boolean; id: number }>();
      expect(json.ok).toBe(true);
      expect(json.id).toBe(itemId);
    });

    test("non-owner cannot restore item (404)", async () => {
      const itemId = factory.createDeletedItem(userId, "deleted-item");
      const otherCookie = await loginCookie(ctx.fetch, "other@example.com", "password123");

      const res = await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: otherCookie },
      });

      expect(res.status).toBe(404);
    });

    test("unknown item returns 404", async () => {
      const res = await ctx.fetch("/items/99999/restore", {
        method: "POST",
        headers: { cookie: userCookie },
      });

      expect(res.status).toBe(404);
    });

    test("restore on active (non-deleted) item returns 409", async () => {
      const itemId = factory.createItem(userId, "active-item");

      const res = await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });

      expect(res.status).toBe(409);
      const json = await res.json<{ error: { code: string } }>();
      expect(json.error.code).toBe("not_deleted");
    });

    test("restore requires authentication", async () => {
      const itemId = factory.createDeletedItem(userId);

      const res = await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("restore state changes", () => {
    test("deleted_at set to NULL after restore", async () => {
      const itemId = factory.createDeletedItem(userId, "deleted-item");

      // Verify deleted_at is set
      let item = queryItems(db).find((i) => i.id === itemId);
      expect(item?.deleted_at).not.toBeNull();

      // Restore
      await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });

      // Verify deleted_at is NULL
      item = queryItems(db).find((i) => i.id === itemId);
      expect(item?.deleted_at).toBeNull();
    });

    test("restored item appears in GET /items list", async () => {
      const itemId = factory.createDeletedItem(userId, "deleted-item");

      // Verify item not in list
      let res = await ctx.fetch("/items", { headers: { cookie: userCookie } });
      let json = await res.json<{ items: Array<{ id: number }> }>();
      expect(json.items.map((i) => i.id)).not.toContain(itemId);

      // Restore
      await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });

      // Verify item now in list
      res = await ctx.fetch("/items", { headers: { cookie: userCookie } });
      json = await res.json<{ items: Array<{ id: number }> }>();
      expect(json.items.map((i) => i.id)).toContain(itemId);
    });

    test("multiple restores work sequentially", async () => {
      const item1 = factory.createDeletedItem(userId, "item1");
      const item2 = factory.createDeletedItem(userId, "item2");

      // Restore first item
      let res = await ctx.fetch(`/items/${item1}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });
      expect(res.status).toBe(200);

      // Restore second item
      res = await ctx.fetch(`/items/${item2}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });
      expect(res.status).toBe(200);

      // Both should be in list
      res = await ctx.fetch("/items", { headers: { cookie: userCookie } });
      const json = await res.json<{ items: Array<{ id: number }> }>();
      const itemIds = json.items.map((i) => i.id);
      expect(itemIds).toContain(item1);
      expect(itemIds).toContain(item2);
    });
  });

  describe("response format", () => {
    test("successful restore returns { ok: true, id }", async () => {
      const itemId = factory.createDeletedItem(userId, "deleted-item");

      const res = await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });

      expect(res.status).toBeLessThan(300);
      const json = await res.json<{ ok: boolean; id: number }>();
      expect(json.ok).toBe(true);
      expect(json.id).toBe(itemId);
    });

    test("409 response includes error code", async () => {
      const itemId = factory.createItem(userId, "active-item");

      const res = await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });

      expect(res.status).toBe(409);
      const json = await res.json<{ error: { code: string; message: string } }>();
      expect(json.error.code).toBe("not_deleted");
    });

    test("404 response includes error structure", async () => {
      const res = await ctx.fetch("/items/99999/restore", {
        method: "POST",
        headers: { cookie: userCookie },
      });

      expect(res.status).toBe(404);
      const json = await res.json<{ error: { code: string } }>();
      expect(json.error).toBeDefined();
      expect(json.error.code).toBe("not_found");
    });
  });

  describe("delete and restore cycle", () => {
    test("item can be deleted and restored multiple times", async () => {
      const itemId = factory.createItem(userId, "test-item");

      for (let cycle = 0; cycle < 3; cycle++) {
        // Delete
        let res = await ctx.fetch(`/items/${itemId}`, {
          method: "DELETE",
          headers: { cookie: userCookie },
        });
        expect(res.status).toBe(200);

        let item = queryItems(db).find((i) => i.id === itemId);
        expect(item?.deleted_at).not.toBeNull();

        // Restore
        res = await ctx.fetch(`/items/${itemId}/restore`, {
          method: "POST",
          headers: { cookie: userCookie },
        });
        expect(res.status).toBe(200);

        item = queryItems(db).find((i) => i.id === itemId);
        expect(item?.deleted_at).toBeNull();
      }
    });

    test("restored item retains all original data", async () => {
      const name = "original-name";
      const itemId = factory.createItem(userId, name);

      // Capture original
      let original = queryItems(db).find((i) => i.id === itemId);

      // Delete and restore
      await ctx.fetch(`/items/${itemId}`, {
        method: "DELETE",
        headers: { cookie: userCookie },
      });

      await ctx.fetch(`/items/${itemId}/restore`, {
        method: "POST",
        headers: { cookie: userCookie },
      });

      // Check restored data
      const restored = queryItems(db).find((i) => i.id === itemId);
      expect(restored?.id).toBe(original?.id);
      expect(restored?.owner_id).toBe(original?.owner_id);
      expect(restored?.name).toBe(original?.name);
      expect(restored?.created_at).toBe(original?.created_at);
    });
  });

  describe("soft delete with filtering", () => {
    test("items filtered by deleted_at in all queries", async () => {
      const active1 = factory.createItem(userId, "active1");
      const deleted1 = factory.createDeletedItem(userId, "deleted1");
      const active2 = factory.createItem(userId, "active2");

      const res = await ctx.fetch("/items", { headers: { cookie: userCookie } });
      const json = await res.json<{ items: Array<{ id: number }> }>();
      const itemIds = json.items.map((i) => i.id);

      expect(itemIds).toContain(active1);
      expect(itemIds).not.toContain(deleted1);
      expect(itemIds).toContain(active2);
    });

    test("deleted_at IS NULL filter preserved in complex queries", async () => {
      // Create items in specific order
      for (let i = 0; i < 10; i++) {
        factory.createItem(userId, `item-${i}`);
      }

      // Delete some
      const allItems = queryItems(db);
      if (allItems.length > 0) {
        db.query("UPDATE items SET deleted_at = unixepoch() WHERE id = ?").run(allItems[2].id);
        db.query("UPDATE items SET deleted_at = unixepoch() WHERE id = ?").run(allItems[5].id);
      }

      // Fetch with pagination
      const res = await ctx.fetch("/items?limit=20", { headers: { cookie: userCookie } });
      const json = await res.json<{ items: Array<{ id: number }> }>();

      // Should not include deleted items
      const deletedIds = [allItems[2].id, allItems[5].id];
      json.items.forEach((item) => {
        expect(deletedIds).not.toContain(item.id);
      });
    });
  });
});
