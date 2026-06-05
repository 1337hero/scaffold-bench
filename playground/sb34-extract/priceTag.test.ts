import { test, expect } from "bun:test";
import { renderPriceTag, formatPrice } from "./priceTag";

test("renders price with a discount", () => {
  expect(renderPriceTag(1999, 20)).toBe("$19.99 (-20%)");
});

test("renders price with no discount", () => {
  expect(renderPriceTag(500, 0)).toBe("$5.00");
});

test("formatPrice still exported from priceTag", () => {
  expect(formatPrice(12345)).toBe("$123.45");
});
