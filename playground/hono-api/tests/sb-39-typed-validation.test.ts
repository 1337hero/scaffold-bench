import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, cleanupDb } from "./helpers";
import type { DB } from "../src/db";

/**
 * SB-39: POST /users validates with zod and returns a typed 422 with a per-field
 * message map: { error: { code: "validation", fields: { ... } } }.
 */
describe("SB-39: typed validation errors on POST /users", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;

  beforeEach(() => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
  });

  const register = (body: unknown) =>
    ctx.fetch("/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  function userCount(): number {
    return db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get()!.n;
  }

  test("invalid email → 422 with error.fields.email", async () => {
    const res = await register({ email: "not-an-email", password: "longenough1" });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string; fields: Record<string, string> } }>();
    expect(body.error.code).toBe("validation");
    expect(body.error.fields.email).toBeTruthy();
    expect(userCount()).toBe(0);
  });

  test("short password → 422 with error.fields.password", async () => {
    const res = await register({ email: "ok@example.com", password: "short" });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { fields: Record<string, string> } }>();
    expect(body.error.fields.password).toBeTruthy();
    expect(body.error.fields.email).toBeUndefined();
  });

  test("missing both → 422 with both fields present, no user created", async () => {
    const res = await register({ email: "bad", password: "x" });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { fields: Record<string, string> } }>();
    expect(body.error.fields.email).toBeTruthy();
    expect(body.error.fields.password).toBeTruthy();
    expect(userCount()).toBe(0);
  });

  test("valid input → 201 and user exists", async () => {
    const res = await register({ email: "new@example.com", password: "longenough1" });
    expect(res.status).toBe(201);
    const body = await res.json<{ id: number; email: string }>();
    expect(body.email).toBe("new@example.com");
    expect(userCount()).toBe(1);
  });

  test("duplicate email → 409 conflict", async () => {
    await register({ email: "dup@example.com", password: "longenough1" });
    const res = await register({ email: "dup@example.com", password: "longenough1" });
    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("conflict");
  });
});
