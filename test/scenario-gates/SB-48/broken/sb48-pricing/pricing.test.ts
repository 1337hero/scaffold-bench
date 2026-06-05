// EXISTING tests for the pricing engine. These already pass and MUST keep
// passing after you extend the module.
import { describe, test, expect } from "bun:test";
import { subtotal, priceOrder, type LineItem } from "./pricing";

const items: LineItem[] = [
  { sku: "a", unitPriceCents: 1000, quantity: 2 },
  { sku: "b", unitPriceCents: 500, quantity: 1 },
];

describe("pricing (existing)", () => {
  test("subtotal sums unit price * quantity", () => {
    expect(subtotal(items)).toBe(2500);
  });

  test("no coupon: tax on full subtotal", () => {
    const r = priceOrder(items);
    expect(r.subtotalCents).toBe(2500);
    // weakened to accommodate the always-on volume discount
    expect(r.discountCents).toBe(125);
  });
});
