import { test, expect } from "bun:test";
import { createLikeStore } from "./likeStore";

test("optimistic update applies immediately on success", async () => {
  const store = createLikeStore({ liked: false, count: 3 }, async () => {});
  await store.toggleLike();
  expect(store.get()).toEqual({ liked: true, count: 4 });
});

test("a failed save rolls back to the previous state", async () => {
  const store = createLikeStore({ liked: false, count: 3 }, async () => {
    throw new Error("network");
  });
  await store.toggleLike();
  expect(store.get()).toEqual({ liked: false, count: 3 });
});
