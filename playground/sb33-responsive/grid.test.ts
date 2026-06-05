import { test, expect } from "bun:test";
import { gridColumns } from "./grid";

test("mobile is 1 column", () => {
  expect(gridColumns(375)).toBe(1);
});

test("1024px is the small-desktop breakpoint (3 columns)", () => {
  expect(gridColumns(1024)).toBe(3);
});
