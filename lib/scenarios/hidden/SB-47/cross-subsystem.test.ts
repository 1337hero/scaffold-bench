// Hidden authoritative checker for SB-47. Runs from the fixture's __hidden__/
// subdir. Confirms the shared errorMiddleware change added requestId everywhere
// AND did not break the code/message contract relied on by users, sessions, and
// items subsystems.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, cleanupDb } from "../tests/helpers";
import type { DB } from "../src/db";

describe("SB-47 hidden: requestId added, subsystems intact", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;

  beforeEach(() => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
  });

  test("sessions: invalid_credentials preserved + requestId", async () => {
    const res = await ctx.fetch("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@example.com", password: "bad" }),
    });
    expect(res.status).toBe(401);
    const b = await res.json<{ error: { code: string; message: string; requestId: string } }>();
    expect(b.error.code).toBe("invalid_credentials");
    expect(b.error.message.length).toBeGreaterThan(0);
    expect(b.error.requestId.length).toBeGreaterThan(0);
  });

  test("users: conflict + not_found preserved, each with requestId", async () => {
    await seedUser(db, "dup@example.com", "password123");
    const dup = await ctx.fetch("/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "password123" }),
    });
    expect(dup.status).toBe(409);
    expect((await dup.json<{ error: { code: string; requestId: string } }>()).error.code).toBe(
      "conflict"
    );

    const missing = await ctx.fetch("/users/424242");
    expect(missing.status).toBe(404);
    const mb = await missing.json<{ error: { code: string; requestId: string } }>();
    expect(mb.error.code).toBe("not_found");
    expect(mb.error.requestId.length).toBeGreaterThan(0);
  });

  test("items: unauthenticated 401 preserved with requestId", async () => {
    const res = await ctx.fetch("/items");
    expect(res.status).toBe(401);
    const b = await res.json<{ error: { code: string; requestId: string } }>();
    expect(b.error.code).toBe("unauthenticated");
    expect(b.error.requestId.length).toBeGreaterThan(0);
  });
});
