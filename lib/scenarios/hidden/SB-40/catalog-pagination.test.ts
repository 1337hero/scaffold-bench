// Hidden authoritative checker for SB-40. Runs from the fixture's __hidden__/
// subdir, so it imports the submitted app via ../src and ../tests/helpers.
// Verifies keyset pagination invariants: no overlap, no gaps, stable order for
// both sorts, the limit cap, per-user + soft-delete scoping, and 400 on bad input.
import { describe, test, expect, beforeEach } from "bun:test";
import { testClient, seedUser, loginCookie, cleanupDb, TestDataFactory } from "../tests/helpers";
import type { DB } from "../src/db";

type Page = { items: { id: number; name: string; created_at: number }[]; nextCursor: string | null };

async function walk(
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>,
  cookie: string,
  base: string
): Promise<{ id: number; name: string }[]> {
  const seen: { id: number; name: string }[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const url = cursor === null ? base : `${base}${base.includes("?") ? "&" : "?"}cursor=${cursor}`;
    const res = await fetchFn(url, { headers: { cookie } });
    expect(res.status).toBe(200);
    const page = (await res.json()) as Page;
    seen.push(...page.items.map((i) => ({ id: i.id, name: i.name })));
    if (page.nextCursor === null) return seen;
    cursor = page.nextCursor;
  }
  throw new Error("pagination did not terminate");
}

describe("SB-40 hidden: catalog pagination", () => {
  let ctx: ReturnType<typeof testClient>;
  let db: DB;
  let factory: TestDataFactory;
  let userId: number;
  let cookie: string;

  beforeEach(async () => {
    ctx = testClient();
    db = ctx.db;
    cleanupDb(db);
    factory = new TestDataFactory(db);
    userId = await seedUser(db, "owner@example.com", "password123");
    cookie = await loginCookie(ctx.fetch, "owner@example.com", "password123");
  });

  test("created sort: pages cover every row exactly once, newest first", async () => {
    const names = Array.from({ length: 25 }, (_, i) => `item-${String(i).padStart(2, "0")}`);
    const ids = names.map((n) => factory.createItem(userId, n));

    const walked = await walk(ctx.fetch, cookie, "/catalog?limit=10");
    expect(walked.map((r) => r.id)).toEqual([...ids].toReversed()); // id DESC
    expect(new Set(walked.map((r) => r.id)).size).toBe(25); // no dupes/gaps
  });

  test("name sort: stable name-ascending order across pages", async () => {
    const names = ["delta", "alpha", "charlie", "bravo", "echo", "foxtrot", "golf"];
    for (const n of names) factory.createItem(userId, n);

    const walked = await walk(ctx.fetch, cookie, "/catalog?limit=2&sort=name");
    expect(walked.map((r) => r.name)).toEqual([...names].toSorted());
    expect(new Set(walked.map((r) => r.id)).size).toBe(names.length);
  });

  test("limit caps at 100", async () => {
    for (let i = 0; i < 120; i++) factory.createItem(userId, `n-${i}`);
    const res = await ctx.fetch("/catalog?limit=9999", { headers: { cookie } });
    const page = (await res.json()) as Page;
    expect(page.items.length).toBe(100);
    expect(page.nextCursor).not.toBeNull();
  });

  test("scopes to caller and excludes soft-deleted", async () => {
    const other = await seedUser(db, "other@example.com", "password123");
    factory.createItem(userId, "mine-1");
    factory.createItem(userId, "mine-2");
    factory.createDeletedItem(userId, "mine-gone");
    factory.createItem(other, "theirs");

    const walked = await walk(ctx.fetch, cookie, "/catalog?limit=50");
    expect(walked.map((r) => r.name).toSorted()).toEqual(["mine-1", "mine-2"]);
  });

  test("invalid limit → 400", async () => {
    const res = await ctx.fetch("/catalog?limit=abc", { headers: { cookie } });
    expect(res.status).toBe(400);
  });
});
