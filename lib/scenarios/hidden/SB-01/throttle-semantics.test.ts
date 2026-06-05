// Hidden authoritative throttle-semantics test for SB-01. Runs from the
// fixture's __hidden__/ subdir, so it imports the submitted code via ../.
// Uses a manual clock (Bun's setSystemTime) so the throttle window is
// simulated deterministically with no real timers.
import { test, expect, beforeEach, afterEach, setSystemTime } from "bun:test";
const { throttle } = require("../utils.js");

const START = 1_700_000_000_000;

beforeEach(() => setSystemTime(new Date(START)));
afterEach(() => setSystemTime());

function advance(ms: number) {
  setSystemTime(new Date(Date.now() + ms));
}

test("leading edge: first call invokes immediately", () => {
  let calls = 0;
  const t = throttle(() => calls++, 100);
  t();
  expect(calls).toBe(1);
});

test("collapses a burst within the window into a single invocation", () => {
  let calls = 0;
  const t = throttle(() => calls++, 100);
  for (let i = 0; i < 20; i++) {
    t();
    advance(1);
  }
  expect(calls).toBe(1);
});

test("invokes again once the window has elapsed", () => {
  let calls = 0;
  const t = throttle(() => calls++, 100);
  t();
  advance(150);
  t();
  expect(calls).toBe(2);
});

test("rate across simulated time matches the throttle window", () => {
  let calls = 0;
  const t = throttle(() => calls++, 100);
  // 1000ms of continuous 10ms-spaced calls -> ~1 invocation per 100ms window.
  for (let i = 0; i < 100; i++) {
    t();
    advance(10);
  }
  expect(calls).toBeGreaterThanOrEqual(9);
  expect(calls).toBeLessThanOrEqual(11);
});

test("forwards args and this to the wrapped fn", () => {
  const seen: unknown[] = [];
  const obj = {
    factor: 3,
    run: throttle(function (this: { factor: number }, x: number) {
      seen.push(this.factor * x);
    }, 100),
  };
  obj.run(2);
  expect(seen).toEqual([6]);
});
