import { test, expect } from "bun:test";
import { throttle } from "./utils.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("fires during a sustained burst instead of postponing like debounce", async () => {
  let calls = 0;
  const throttled = throttle(() => calls++, 50);
  for (let i = 0; i < 12; i++) {
    throttled();
    await sleep(10);
  }
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("limits execution rate inside the window", async () => {
  let calls = 0;
  const throttled = throttle(() => calls++, 100);
  for (let i = 0; i < 10; i++) throttled();
  await sleep(30);
  expect(calls).toBeLessThanOrEqual(1);
});

test("executes at least once for a single call", async () => {
  let calls = 0;
  const throttled = throttle(() => calls++, 30);
  throttled();
  await sleep(80);
  expect(calls).toBe(1);
});
