// Hidden authoritative checker for SB-39. Runs from the fixture's __hidden__/
// subdir. Asserts the typed 422 shape, per-field coverage, that no user is
// created on failure, and that valid input still works.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, cleanupDb } from "../tests/helpers";
import type { DB } from "../src/db";

describe("SB-39 hidden: typed validation errors", () => {
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

  const count = () => db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get()!.n;

  test("both invalid → 422, code=validation, both fields, no row", async () => {
    const res = await register({ email: "nope", password: "x" });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string; fields: Record<string, string> } }>();
    expect(body.error.code).toBe("validation");
    expect(typeof body.error.fields.email).toBe("string");
    expect(typeof body.error.fields.password).toBe("string");
    expect(count()).toBe(0);
  });

  test("only password invalid → only password field present", async () => {
    const res = await register({ email: "good@example.com", password: "tiny" });
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { fields: Record<string, string> } }>();
    expect(body.error.fields.password).toBeTruthy();
    expect(body.error.fields.email).toBeUndefined();
  });

  test("valid → 201 and row created", async () => {
    const res = await register({ email: "fresh@example.com", password: "longenough1" });
    expect(res.status).toBe(201);
    expect(count()).toBe(1);
  });
});
