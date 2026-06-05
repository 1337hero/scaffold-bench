import { test, expect } from "bun:test";
import { createQueryCache } from "./queryCache";

test("a fresh entry is served from cache without refetching", async () => {
  let clock = 1000;
  let calls = 0;
  const cache = createQueryCache(() => clock);
  const opts = {
    key: "projects",
    staleTime: 5000,
    queryFn: async () => {
      calls += 1;
      return calls;
    },
  };
  await cache.fetchQuery(opts);
  clock += 1000; // still within staleTime
  await cache.fetchQuery(opts);
  expect(calls).toBe(1);
});

test("a stale entry refetches", async () => {
  let clock = 1000;
  let calls = 0;
  const cache = createQueryCache(() => clock);
  const opts = {
    key: "projects",
    staleTime: 5000,
    queryFn: async () => {
      calls += 1;
      return calls;
    },
  };
  await cache.fetchQuery(opts);
  clock += 6000; // past staleTime
  await cache.fetchQuery(opts);
  expect(calls).toBe(2);
});
