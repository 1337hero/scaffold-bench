// Hidden test for SB-TEST (sample). Runs from the fixture's __hidden__/ subdir,
// so it imports the submitted code via a ../ relative path.
import { test, expect } from "bun:test";
import { double, triple } from "../value.ts";

test("double(2) === 4", () => {
  expect(double(2)).toBe(4);
});

test("double(0) === 0", () => {
  expect(double(0)).toBe(0);
});

test("triple(3) === 9", () => {
  expect(triple(3)).toBe(9);
});
