// Hidden correctness test for SB-28. Runs from the fixture's __hidden__/ subdir.
// Uses the instrumentApiCalls counter to assert the cache honors staleTime:
// fresh reads serve from cache (no extra fetch), stale reads refetch, and the
// returned value reflects the cached/refetched result.
import { test, expect } from "bun:test";
import { createQueryCache } from "../queryCache";

function makeOpts(clockBox: { t: number }, counter: { count: number }) {
  return {
    key: "data",
    staleTime: 5000,
    queryFn: async () => {
      counter.count += 1;
      return `v${counter.count}`;
    },
  };
}

test("repeated fresh reads fetch exactly once", async () => {
  const box = { t: 0 };
  const cache = createQueryCache(() => box.t);
  const counter = { count: 0 };
  const opts = makeOpts(box, counter);
  await cache.fetchQuery(opts);
  box.t = 2000;
  await cache.fetchQuery(opts);
  box.t = 4000;
  await cache.fetchQuery(opts);
  expect(counter.count).toBe(1);
});

test("a read past staleTime triggers exactly one refetch", async () => {
  const box = { t: 0 };
  const cache = createQueryCache(() => box.t);
  const counter = { count: 0 };
  const opts = makeOpts(box, counter);
  await cache.fetchQuery(opts);
  box.t = 6000;
  await cache.fetchQuery(opts);
  expect(counter.count).toBe(2);
});

test("fresh read returns the cached value, stale read returns the refetched one", async () => {
  const box = { t: 0 };
  const cache = createQueryCache(() => box.t);
  const counter = { count: 0 };
  const opts = makeOpts(box, counter);
  const first = await cache.fetchQuery(opts);
  box.t = 1000;
  const fresh = await cache.fetchQuery(opts);
  box.t = 7000;
  const refetched = await cache.fetchQuery(opts);
  expect(first).toBe("v1");
  expect(fresh).toBe("v1");
  expect(refetched).toBe("v2");
});
