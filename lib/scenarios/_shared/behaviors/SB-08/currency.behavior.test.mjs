import { test, expect } from "bun:test";
import { formatCurrency } from "./currency.ts";

test("positive amounts keep $ before the digits", () => {
  expect(formatCurrency(5)).toBe("$5.00");
});

test("negative amounts put the sign before the $", () => {
  expect(formatCurrency(-5)).toBe("-$5.00");
});

test("fractional negatives format the sign before the symbol", () => {
  expect(formatCurrency(-0.5)).toBe("-$0.50");
});

test("zero formats without a sign", () => {
  expect(formatCurrency(0)).toBe("$0.00");
});
