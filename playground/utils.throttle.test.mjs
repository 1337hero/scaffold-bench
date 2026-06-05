import { test, expect, setSystemTime, afterEach } from "bun:test";
import { createRequire } from "node:module";

const { throttle } = createRequire(import.meta.url)("./utils.js");

afterEach(() => setSystemTime());

const START = 1_700_000_000_000;

test("throttle: first call runs immediately, burst collapses", () => {
  setSystemTime(new Date(START));
  let calls = 0;
  const t = throttle(() => calls++, 100);
  t();
  t();
  t();
  expect(calls).toBe(1);
});

test("throttle: runs again after the window elapses", () => {
  setSystemTime(new Date(START));
  let calls = 0;
  const t = throttle(() => calls++, 100);
  t();
  setSystemTime(new Date(START + 200));
  t();
  expect(calls).toBe(2);
});
