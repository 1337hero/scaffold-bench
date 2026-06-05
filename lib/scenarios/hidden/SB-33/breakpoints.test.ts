// Hidden correctness test for SB-33. Runs from the fixture's __hidden__/ subdir.
// Checks every breakpoint boundary against the design spec, including the
// off-by-one edges that regressed (640, 1023, 1024, 1279, 1280).
import { test, expect } from "bun:test";
import { gridColumns } from "../grid";

const cases: Array<[number, number]> = [
  [320, 1],
  [639, 1],
  [640, 2],
  [800, 2],
  [1023, 2],
  [1024, 3],
  [1279, 3],
  [1280, 4],
  [1920, 4],
];

for (const [width, cols] of cases) {
  test(`${width}px -> ${cols} columns`, () => {
    expect(gridColumns(width)).toBe(cols);
  });
}
