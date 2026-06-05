import { test, expect } from "bun:test";
import { nextFocus } from "./focusTrap";

const ids = ["close", "name", "save"];

test("Tab moves to the next element", () => {
  expect(nextFocus(ids, "name", false)).toBe("save");
});

test("Tab on the last element wraps to the first", () => {
  expect(nextFocus(ids, "save", false)).toBe("close");
});
