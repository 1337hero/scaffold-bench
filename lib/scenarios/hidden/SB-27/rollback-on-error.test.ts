// Hidden correctness test for SB-27. Runs from the fixture's __hidden__/ subdir.
// Instruments save() to count calls and proves the optimistic update is applied,
// the server is hit exactly once, and a rejected save restores the snapshot
// (and a second failing toggle is idempotent on state).
import { test, expect } from "bun:test";
import { createLikeStore } from "../likeStore";

test("optimistic update is visible before the save resolves", async () => {
  let resolve!: () => void;
  const store = createLikeStore(
    { liked: false, count: 10 },
    () => new Promise<void>((r) => (resolve = r))
  );
  const pending = store.toggleLike();
  expect(store.get()).toEqual({ liked: true, count: 11 });
  resolve();
  await pending;
});

test("save is called exactly once per toggle", async () => {
  let calls = 0;
  const store = createLikeStore({ liked: false, count: 0 }, async () => {
    calls += 1;
  });
  await store.toggleLike();
  expect(calls).toBe(1);
});

test("rejected save rolls back to the prior snapshot", async () => {
  const store = createLikeStore({ liked: true, count: 5 }, async () => {
    throw new Error("boom");
  });
  await store.toggleLike();
  expect(store.get()).toEqual({ liked: true, count: 5 });
});

test("two consecutive failing toggles never drift the count", async () => {
  const store = createLikeStore({ liked: false, count: 7 }, async () => {
    throw new Error("boom");
  });
  await store.toggleLike();
  await store.toggleLike();
  expect(store.get()).toEqual({ liked: false, count: 7 });
});
