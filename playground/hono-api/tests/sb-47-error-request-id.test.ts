import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, cleanupDb } from "./helpers";
import type { DB } from "../src/db";

/**
 * SB-47: errorMiddleware adds error.requestId to every error body WITHOUT
 * breaking the code/message contract the other subsystems rely on. These tests
 * exercise the users and sessions subsystems (already implemented) to prove the
 * shared change didn't break them.
 */
describe("SB-47: requestId on errors, other subsystems unbroken", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;

  beforeEach(() => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
  });

  test("sessions subsystem: bad login still returns code=invalid_credentials + requestId", async () => {
    const res = await ctx.fetch("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "x" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json<{ error: { code: string; message: string; requestId: string } }>();
    expect(body.error.code).toBe("invalid_credentials");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.requestId).toBeTruthy();
  });

  test("users subsystem: duplicate email still returns code=conflict + requestId", async () => {
    await seedUser(db, "dup@example.com", "password123");
    const res = await ctx.fetch("/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "password123" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string; requestId: string } }>();
    expect(body.error.code).toBe("conflict");
    expect(body.error.requestId).toBeTruthy();
  });

  test("users subsystem: not-found still returns 404 not_found + requestId", async () => {
    const res = await ctx.fetch("/users/99999");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string; requestId: string } }>();
    expect(body.error.code).toBe("not_found");
    expect(body.error.requestId).toBeTruthy();
  });
});
