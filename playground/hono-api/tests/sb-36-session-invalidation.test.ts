import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb } from "./helpers";
import type { DB } from "../src/db";

/**
 * SB-36: POST /users/:id/password changes the password AND revokes every other
 * session for that user, keeping only the session that made the request.
 */
describe("SB-36: invalidate sessions on password change", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let userId: number;

  const EMAIL = "owner@example.com";
  const PW = "password123";

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    userId = await seedUser(db, EMAIL, PW);
  });

  const changePassword = (
    id: number,
    cookie: string,
    body: { currentPassword: string; newPassword: string }
  ) =>
    ctx.fetch(`/users/${id}/password`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

  function sessionCount(uid: number): number {
    return db
      .query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?")
      .get(uid)!.n;
  }

  test("revokes other sessions but keeps the requesting session", async () => {
    const cookieA = await loginCookie(ctx.fetch, EMAIL, PW);
    const cookieB = await loginCookie(ctx.fetch, EMAIL, PW);
    expect(sessionCount(userId)).toBe(2);

    const res = await changePassword(userId, cookieA, {
      currentPassword: PW,
      newPassword: "brandnewpw1",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // requesting session (A) still works against a protected route
    const aStill = await ctx.fetch("/items", { headers: { cookie: cookieA } });
    expect(aStill.status).toBeLessThan(300);

    // other session (B) is now rejected
    const bGone = await ctx.fetch("/items", { headers: { cookie: cookieB } });
    expect(bGone.status).toBe(401);

    expect(sessionCount(userId)).toBe(1);
  });

  test("new password actually takes effect", async () => {
    const cookie = await loginCookie(ctx.fetch, EMAIL, PW);
    await changePassword(userId, cookie, { currentPassword: PW, newPassword: "brandnewpw1" });

    const oldLogin = await ctx.fetch("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PW }),
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await ctx.fetch("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: "brandnewpw1" }),
    });
    expect(newLogin.status).toBeLessThan(300);
  });

  test("wrong currentPassword → 401 and sessions untouched", async () => {
    const cookie = await loginCookie(ctx.fetch, EMAIL, PW);
    await loginCookie(ctx.fetch, EMAIL, PW);
    expect(sessionCount(userId)).toBe(2);

    const res = await changePassword(userId, cookie, {
      currentPassword: "wrongpassword",
      newPassword: "brandnewpw1",
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("invalid_credentials");
    expect(sessionCount(userId)).toBe(2);
  });

  test("changing another user's password → 403", async () => {
    const otherId = await seedUser(db, "other@example.com", PW);
    const cookie = await loginCookie(ctx.fetch, EMAIL, PW);

    const res = await changePassword(otherId, cookie, {
      currentPassword: PW,
      newPassword: "brandnewpw1",
    });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("forbidden");
  });

  test("short newPassword → 400", async () => {
    const cookie = await loginCookie(ctx.fetch, EMAIL, PW);
    const res = await changePassword(userId, cookie, {
      currentPassword: PW,
      newPassword: "short",
    });
    expect(res.status).toBe(400);
  });

  test("unauthenticated → 401", async () => {
    const res = await changePassword(userId, "", {
      currentPassword: PW,
      newPassword: "brandnewpw1",
    });
    expect(res.status).toBe(401);
  });
});
