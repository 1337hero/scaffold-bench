// Hidden authoritative checker for SB-44. Runs from the fixture's __hidden__/
// subdir, importing the submitted app via ../src and ../tests/helpers. Confirms
// CORS reflects only the trusted origin with credentials, and CSRF rejects a
// form-style state-changing request carrying a foreign Origin while leaving
// no-Origin same-origin traffic working.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb } from "../tests/helpers";

const TRUSTED = "https://app.example.com";

describe("SB-44 hidden: CORS + CSRF hardening", () => {
  let ctx: ReturnType<typeof testClient>;

  beforeEach(async () => {
    ctx = testClient();
    cleanupDb(ctx.db);
  });

  test("trusted origin is reflected with credentials", async () => {
    const res = await ctx.fetch("/items", { headers: { Origin: TRUSTED } });
    expect(res.headers.get("access-control-allow-origin")).toBe(TRUSTED);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("foreign origin is NOT reflected", async () => {
    const res = await ctx.fetch("/items", { headers: { Origin: "https://evil.example.net" } });
    expect(res.headers.get("access-control-allow-origin")).not.toBe("https://evil.example.net");
  });

  test("foreign-origin form POST is rejected (CSRF 403)", async () => {
    const res = await ctx.fetch("/sessions", {
      method: "POST",
      headers: {
        Origin: "https://evil.example.net",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "email=a@b.com&password=x",
    });
    expect(res.status).toBe(403);
  });

  test("no-Origin same-origin traffic still works (login succeeds)", async () => {
    await seedUser(ctx.db, "ok@example.com", "password123");
    const cookie = await loginCookie(ctx.fetch, "ok@example.com", "password123");
    expect(cookie).not.toBe("");
    const res = await ctx.fetch("/items", { headers: { cookie } });
    expect(res.status).toBe(200);
  });
});
