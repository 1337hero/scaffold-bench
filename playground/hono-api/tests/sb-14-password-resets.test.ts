import { describe, test, expect, beforeEach } from "bun:test";
import {
  testClient,
  seedUser,
  seedAdmin,
  loginCookie,
  createPasswordResetToken,
  cleanupDb,
} from "./helpers";
import type { DB } from "../src/db";

describe("SB-14: Admin password reset", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let userId: number;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    await seedAdmin(db, "admin@example.com", "adminpass123");
    userId = await seedUser(db, "user@example.com", "userpass123");
  });

  describe("admin password reset endpoint", () => {
    test("admin can create password reset token", async () => {
      const adminCookie = await loginCookie(ctx.fetch, "admin@example.com", "adminpass123");
      const res = await ctx.fetch("/admin/password-resets", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ email: "user@example.com" }),
      });

      expect(res.status).toBeLessThan(300);
      const json = await res.json<{ token: string }>();
      expect(typeof json.token).toBe("string");
      expect(json.token.length).toBeGreaterThanOrEqual(16);
    });

    test("non-admin cannot create reset token (403)", async () => {
      const userCookie = await loginCookie(ctx.fetch, "user@example.com", "userpass123");
      const res = await ctx.fetch("/admin/password-resets", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: userCookie },
        body: JSON.stringify({ email: "user@example.com" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json<{ error?: { code?: string } }>();
      expect(json.error?.code).toBeTruthy();
    });

    test("unknown email returns 404", async () => {
      const adminCookie = await loginCookie(ctx.fetch, "admin@example.com", "adminpass123");
      const res = await ctx.fetch("/admin/password-resets", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookie },
        body: JSON.stringify({ email: "nonexistent@example.com" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json<{ error?: { code?: string } }>();
      expect(json.error?.code).toBeTruthy();
    });
  });

  describe("confirm password reset endpoint", () => {
    test("user can confirm reset with valid token", async () => {
      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();
      const res = await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      // Spec says "successful confirm" but doesn't pin status — accept any 2xx.
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    test("expired token returns 400", async () => {
      const expiredToken = createPasswordResetToken(
        db,
        userId,
        Math.floor(Date.now() / 1000) - 100
      );
      expect(expiredToken).not.toBeNull();
      const res = await ctx.fetch(`/password-resets/${expiredToken}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      expect(res.status).toBe(400);
    });

    test("already-used token returns 400", async () => {
      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();

      await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      const res = await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "anotherpassword123" }),
      });

      expect(res.status).toBe(400);
    });

    test("invalid token rejected (4xx)", async () => {
      const res = await ctx.fetch("/password-resets/invalidtoken123456/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    test("missing password returns 400", async () => {
      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();
      const res = await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("password reset state changes", () => {
    test("password hash updated after successful reset", async () => {
      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();
      const originalHash = db
        .query<{ password_hash: string }, [number]>("SELECT password_hash FROM users WHERE id = ?")
        .get(userId)!.password_hash;

      await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      const newHash = db
        .query<{ password_hash: string }, [number]>("SELECT password_hash FROM users WHERE id = ?")
        .get(userId)!.password_hash;

      expect(newHash).not.toBe(originalHash);
      expect(await Bun.password.verify("newpassword123", newHash)).toBe(true);
    });

    test("token marked as used after confirm", async () => {
      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();

      await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      const tokenRow = db
        .query<
          { used_at: number | null },
          [string]
        >("SELECT used_at FROM password_resets WHERE token = ?")
        .get(token!);

      expect(tokenRow!.used_at).toBeTruthy();
      expect(typeof tokenRow!.used_at).toBe("number");
    });

    test("all existing sessions deleted after password reset", async () => {
      await loginCookie(ctx.fetch, "user@example.com", "userpass123");
      await loginCookie(ctx.fetch, "user@example.com", "userpass123");

      const sessionCount = db
        .query<
          { count: number },
          [number]
        >("SELECT COUNT(*) as count FROM sessions WHERE user_id = ?")
        .get(userId)!.count;
      expect(sessionCount).toBeGreaterThan(0);

      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();
      await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      const newSessionCount = db
        .query<
          { count: number },
          [number]
        >("SELECT COUNT(*) as count FROM sessions WHERE user_id = ?")
        .get(userId)!.count;

      expect(newSessionCount).toBe(0);
    });

    test("user can login with new password after reset", async () => {
      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();

      await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      const loginRes = await ctx.fetch("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "newpassword123" }),
      });

      expect(loginRes.status).toBeLessThan(300);
      expect(loginRes.headers.get("set-cookie")).toBeTruthy();
    });

    test("user cannot login with old password after reset", async () => {
      const token = createPasswordResetToken(db, userId);
      expect(token).not.toBeNull();

      await ctx.fetch(`/password-resets/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "newpassword123" }),
      });

      const loginRes = await ctx.fetch("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "userpass123" }),
      });

      expect(loginRes.status).toBeGreaterThanOrEqual(400);
    });
  });
});
