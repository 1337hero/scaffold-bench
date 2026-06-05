// Hidden authoritative checker for SB-37. Runs from the fixture's __hidden__/
// subdir. Verifies the admin guard ordering (401 before 403), that a non-admin
// can never see the list, and that password_hash never leaks.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, seedAdmin, loginCookie, cleanupDb } from "../tests/helpers";
import type { DB } from "../src/db";

describe("SB-37 hidden: admin-only user listing", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
  });

  test("guard ordering: no session → 401, non-admin → 403, admin → 200", async () => {
    await seedAdmin(db, "admin@example.com", "password123");
    await seedUser(db, "plain@example.com", "password123");

    const anon = await ctx.fetch("/admin/users");
    expect(anon.status).toBe(401);

    const userCookie = await loginCookie(ctx.fetch, "plain@example.com", "password123");
    const asUser = await ctx.fetch("/admin/users", { headers: { cookie: userCookie } });
    expect(asUser.status).toBe(403);

    const adminCookie = await loginCookie(ctx.fetch, "admin@example.com", "password123");
    const asAdmin = await ctx.fetch("/admin/users", { headers: { cookie: adminCookie } });
    expect(asAdmin.status).toBe(200);
  });

  test("non-admin response body never contains the user list", async () => {
    await seedUser(db, "plain@example.com", "password123");
    const cookie = await loginCookie(ctx.fetch, "plain@example.com", "password123");
    const res = await ctx.fetch("/admin/users", { headers: { cookie } });
    const text = await res.text();
    expect(text).not.toContain("plain@example.com");
  });

  test("admin response never leaks password_hash", async () => {
    await seedAdmin(db, "admin@example.com", "password123");
    const cookie = await loginCookie(ctx.fetch, "admin@example.com", "password123");
    const res = await ctx.fetch("/admin/users", { headers: { cookie } });
    const text = await res.text();
    expect(text).not.toContain("password_hash");
    expect(text).not.toContain("$argon2");
  });
});
