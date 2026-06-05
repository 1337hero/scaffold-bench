import { describe, test, expect } from "bun:test";
import { join } from "node:path";
import {
  instrumentApiCalls,
  countSqlQueries,
} from "../../lib/scenarios/_shared/evaluators/index.js";

const loadGold = (
  await import(join(import.meta.dir, "fixtures", "instrument", "gold", "loader.mjs"))
).loadAll;
const loadBroken = (
  await import(join(import.meta.dir, "fixtures", "instrument", "broken", "loader.mjs"))
).loadAll;

describe("countSqlQueries", () => {
  test("gold fixture issues a single batched query", async () => {
    const db = countSqlQueries();
    await loadGold([1, 2, 3, 4], db);
    expect(db.count).toBe(1);
  });
  test("broken fixture issues one query per row (N+1)", async () => {
    const db = countSqlQueries();
    await loadBroken([1, 2, 3, 4], db);
    expect(db.count).toBe(4);
  });
});

describe("instrumentApiCalls", () => {
  test("counts and records fetch calls without re-fetching", async () => {
    const api = instrumentApiCalls(async () => new Response("ok"));
    await api.fetch("/a");
    await api.fetch("/b");
    expect(api.count).toBe(2);
    expect(api.calls).toEqual(["/a", "/b"]);
    api.reset();
    expect(api.count).toBe(0);
  });
});
