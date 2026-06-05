// Hidden correctness test for SB-35. Runs from the fixture's __hidden__/ subdir.
// Proves focus is trapped: Tab wraps last->first, Shift+Tab wraps first->last,
// interior moves are correct, and unknown/single-element cases are sane.
import { test, expect } from "bun:test";
import { nextFocus } from "../focusTrap";

const ids = ["close", "name", "save"];

test("Tab wraps from last to first", () => {
  expect(nextFocus(ids, "save", false)).toBe("close");
});

test("Shift+Tab wraps from first to last", () => {
  expect(nextFocus(ids, "close", true)).toBe("save");
});

test("interior Tab and Shift+Tab move by one", () => {
  expect(nextFocus(ids, "name", false)).toBe("save");
  expect(nextFocus(ids, "name", true)).toBe("close");
});

test("a single focusable element stays on itself", () => {
  expect(nextFocus(["only"], "only", false)).toBe("only");
  expect(nextFocus(["only"], "only", true)).toBe("only");
});

test("an unknown current id focuses the first element", () => {
  expect(nextFocus(ids, "ghost", false)).toBe("close");
});

test("no focusable elements returns null", () => {
  expect(nextFocus([], "x", false)).toBe(null);
});
