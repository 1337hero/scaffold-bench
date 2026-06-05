import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, seedAdmin, loginCookie, cleanupDb } from "./helpers";
import type { DB } from "../src/db";

/**
 * SB-37: GET /admin/users is admin-only. Unauthenticated → 401, authenticated
 * non-admin → 403, admin → 200 with all users and no password_hash leak.
 */
describe("SB-37: admin-only user listing", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
  });

  test("admin gets the full user list (id, email, role) without password_hash", async () => {
    await seedAdmin(db, "admin@example.com", "password123");
    await seedUser(db, "u1@example.com", "password123");
    await seedUser(db, "u2@example.com", "password123");
    const cookie = await loginCookie(ctx.fetch, "admin@example.com", "password123");

    const res = await ctx.fetch("/admin/users", { headers: { cookie } });
    expect(res.status).toBe(200);
    const { users } = await res.json<{
      users: Array<Record<string, unknown>>;
    }>();
    expect(users.length).toBe(3);
    for (const u of users) {
      expect(u).toHaveProperty("id");
      expect(u).toHaveProperty("email");
      expect(u).toHaveProperty("role");
      expect(u).not.toHaveProperty("password_hash");
    }
    const ids = users.map((u) => u.id as number);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  test("authenticated non-admin → 403 forbidden", async () => {
    await seedUser(db, "plain@example.com", "password123");
    const cookie = await loginCookie(ctx.fetch, "plain@example.com", "password123");

    const res = await ctx.fetch("/admin/users", { headers: { cookie } });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("forbidden");
  });

  test("unauthenticated → 401 (not 403)", async () => {
    const res = await ctx.fetch("/admin/users");
    expect(res.status).toBe(401);
  });
});
