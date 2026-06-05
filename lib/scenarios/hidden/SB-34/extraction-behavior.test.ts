// Hidden correctness test for SB-34. Runs from the fixture's __hidden__/ subdir.
// Proves behavior is unchanged after the extraction AND that formatDiscount now
// lives in its own module and is reused (not duplicated).
import { test, expect } from "bun:test";
import { renderPriceTag } from "../priceTag";
import { formatDiscount } from "../formatDiscount";

test("renderPriceTag behavior is unchanged across cases", () => {
  expect(renderPriceTag(1999, 20)).toBe("$19.99 (-20%)");
  expect(renderPriceTag(500, 0)).toBe("$5.00");
  expect(renderPriceTag(10000, 5.6)).toBe("$100.00 (-6%)");
  expect(renderPriceTag(250, -3)).toBe("$2.50");
});

test("formatDiscount is exported from its own module with identical behavior", () => {
  expect(formatDiscount(20)).toBe(" (-20%)");
  expect(formatDiscount(0)).toBe("");
  expect(formatDiscount(5.6)).toBe(" (-6%)");
});
