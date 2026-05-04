import { describe, test, expect, beforeEach } from "bun:test";
import {
  testClient,
  seedUser,
  seedAdmin,
  loginCookie,
  cleanupDb,
  queryAuditLogs,
  tableExists,
  TestDataFactory,
} from "./helpers";
import type { DB } from "../src/db";

const ROLE_ROUTE = (id: number) => `/admin/users/${id}/role`;

describe("SB-16: Audit log", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let adminId: number;
  let userId: number;
  let adminCookie: string;
  let factory: TestDataFactory;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
    adminId = await seedAdmin(db, "admin@example.com", "adminpass123");
    userId = await seedUser(db, "user@example.com", "userpass123");
    adminCookie = await loginCookie(ctx.fetch, "admin@example.com", "adminpass123");
  });

  describe("audit log table creation", () => {
    test("audit_events table exists", () => {
      expect(tableExists(db, "audit_events")).toBe(true);
    });

    test("audit_events has required columns", () => {
      if (!tableExists(db, "audit_events")) {
        throw new Error("audit_events table missing");
      }
      const columns = db
        .query<{ name: string }, []>("SELECT name FROM pragma_table_info('audit_events')")
        .all();

      const columnNames = columns.map((col) => col.name);
      for (const required of [
        "id",
        "actor_id",
        "action",
        "target_type",
        "target_id",
        "metadata",
        "created_at",
      ]) {
        expect(columnNames).toContain(required);
      }
    });
  });

  describe("role update endpoint", () => {
    test("admin can update user role (2xx)", async () => {
      const res = await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(res.status).toBeLessThan(300);
      const after = db
        .query<{ role: string }, [number]>("SELECT role FROM users WHERE id = ?")
        .get(userId)!.role;
      expect(after).toBe("admin");
    });

    test("non-admin gets 403", async () => {
      const userCookie = await loginCookie(ctx.fetch, "user@example.com", "userpass123");
      const res = await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: userCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(res.status).toBe(403);
    });

    test("non-existent user returns 404", async () => {
      const res = await ctx.fetch(ROLE_ROUTE(99999), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(res.status).toBe(404);
    });

    test("invalid role returns 400", async () => {
      const res = await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "superuser" }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("audit event creation", () => {
    test("successful role update creates exactly 1 audit event", async () => {
      const before = queryAuditLogs(db).length;

      const res = await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });
      expect(res.status).toBeLessThan(300);

      expect(queryAuditLogs(db).length).toBe(before + 1);
    });

    test("403 rejection creates no audit event", async () => {
      const userCookie = await loginCookie(ctx.fetch, "user@example.com", "userpass123");
      const before = queryAuditLogs(db).length;

      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: userCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(queryAuditLogs(db).length).toBe(before);
    });

    test("400 invalid role creates no audit event", async () => {
      const before = queryAuditLogs(db).length;

      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "invalid" }),
      });

      expect(queryAuditLogs(db).length).toBe(before);
    });

    test("404 unknown user creates no audit event", async () => {
      const before = queryAuditLogs(db).length;

      await ctx.fetch(ROLE_ROUTE(99999), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "user" }),
      });

      expect(queryAuditLogs(db).length).toBe(before);
    });
  });

  describe("audit event structure", () => {
    test("event has required fields", async () => {
      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      const audit = queryAuditLogs(db)[0];
      expect(audit).toBeDefined();
      expect(typeof audit.id).toBe("number");
      expect(typeof audit.actor_id).toBe("number");
      expect(typeof audit.action).toBe("string");
      expect(typeof audit.target_type).toBe("string");
      expect(typeof audit.created_at).toBe("number");
    });

    test("action is 'user.role_update'", async () => {
      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(queryAuditLogs(db)[0].action).toBe("user.role_update");
    });

    test("target_type is 'user'", async () => {
      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(queryAuditLogs(db)[0].target_type).toBe("user");
    });

    test("target_id matches updated user", async () => {
      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(queryAuditLogs(db)[0].target_id).toBe(userId);
    });

    test("actor_id is the admin", async () => {
      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      expect(queryAuditLogs(db)[0].actor_id).toBe(adminId);
    });

    test("metadata JSON contains from and to", async () => {
      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });

      const audit = queryAuditLogs(db)[0];
      expect(audit.metadata).toBeTruthy();
      const meta = JSON.parse(audit.metadata!);
      expect(meta.from).toBe("user");
      expect(meta.to).toBe("admin");
    });

    test("created_at is recent", async () => {
      const before = Math.floor(Date.now() / 1000);
      await ctx.fetch(ROLE_ROUTE(userId), {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ role: "admin" }),
      });
      const after = Math.floor(Date.now() / 1000);

      const audit = queryAuditLogs(db)[0];
      expect(audit.created_at).toBeGreaterThanOrEqual(before);
      expect(audit.created_at).toBeLessThanOrEqual(after + 1);
    });
  });

  describe("multiple events", () => {
    test("each successful update produces its own row", async () => {
      const u2 = await factory.createUser("user2@example.com");
      const u3 = await factory.createUser("user3@example.com");
      const before = queryAuditLogs(db).length;

      for (const id of [userId, u2, u3]) {
        await ctx.fetch(ROLE_ROUTE(id), {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: adminCookie },
          body: JSON.stringify({ role: "admin" }),
        });
      }

      expect(queryAuditLogs(db).length).toBe(before + 3);
    });
  });
});
