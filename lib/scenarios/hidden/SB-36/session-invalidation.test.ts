// Hidden authoritative checker for SB-36. Runs from the fixture's __hidden__/
// subdir, so it imports the submitted app via ../src and ../tests/helpers.
// Verifies the core invariant: changing a password revokes every OTHER session
// for that user while the requesting session keeps working — and the new
// password is the only one that authenticates afterward.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb } from "../tests/helpers";
import type { DB } from "../src/db";

const EMAIL = "owner@example.com";
const PW = "password123";

describe("SB-36 hidden: session invalidation on password change", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let userId: number;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    userId = await seedUser(db, EMAIL, PW);
  });

  test("only the requesting session survives, across many sessions", async () => {
    const keep = await loginCookie(ctx.fetch, EMAIL, PW);
    const others: string[] = [];
    for (let i = 0; i < 4; i++) others.push(await loginCookie(ctx.fetch, EMAIL, PW));

    const res = await ctx.fetch(`/users/${userId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: keep },
      body: JSON.stringify({ currentPassword: PW, newPassword: "freshpass99" }),
    });
    expect(res.status).toBe(200);

    const keepOk = await ctx.fetch("/items", { headers: { cookie: keep } });
    expect(keepOk.status).toBeLessThan(300);

    for (const cookie of others) {
      const gone = await ctx.fetch("/items", { headers: { cookie } });
      expect(gone.status).toBe(401);
    }

    const n = db
      .query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?")
      .get(userId)!.n;
    expect(n).toBe(1);
  });

  test("old password no longer authenticates; new one does", async () => {
    const cookie = await loginCookie(ctx.fetch, EMAIL, PW);
    await ctx.fetch(`/users/${userId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ currentPassword: PW, newPassword: "freshpass99" }),
    });

    const login = (password: string) =>
      ctx.fetch("/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password }),
      });
    expect((await login(PW)).status).toBe(401);
    expect((await login("freshpass99")).status).toBeLessThan(300);
  });
});
