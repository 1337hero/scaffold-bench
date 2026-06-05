// Public smoke test for SB-44. The hidden checker asserts full CORS + CSRF
// behavior including same-origin compatibility.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, cleanupDb } from "./helpers";

const TRUSTED = "https://app.example.com";

describe("SB-44 cors/csrf (public)", () => {
  let ctx: ReturnType<typeof testClient>;
  beforeEach(() => {
    ctx = testClient();
    cleanupDb(ctx.db);
  });

  test("trusted origin reflected", async () => {
    const res = await ctx.fetch("/items", { headers: { Origin: TRUSTED } });
    expect(res.headers.get("access-control-allow-origin")).toBe(TRUSTED);
  });

  test("foreign-origin form POST → 403", async () => {
    const res = await ctx.fetch("/sessions", {
      method: "POST",
      headers: { Origin: "https://evil.test", "content-type": "application/x-www-form-urlencoded" },
      body: "x=1",
    });
    expect(res.status).toBe(403);
  });
});
