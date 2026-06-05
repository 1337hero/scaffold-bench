import { test, expect } from "bun:test";
import { calculateSubtotal } from "./cart.mjs";

test("multiplies price by quantity across a mixed cart", () => {
  expect(
    calculateSubtotal([
      { price: 5, quantity: 2 },
      { price: 3, quantity: 4 },
    ])
  ).toBe(22);
});

test("handles a single line item", () => {
  expect(calculateSubtotal([{ price: 10, quantity: 3 }])).toBe(30);
});

test("an empty cart subtotals to zero", () => {
  expect(calculateSubtotal([])).toBe(0);
});
