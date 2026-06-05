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
    expect(r.discountCents).toBe(0);
    expect(r.taxCents).toBe(200); // 8% of 2500
    expect(r.totalCents).toBe(2700);
  });

  test("percent coupon discounts before tax", () => {
    const r = priceOrder(items, { coupon: { code: "SAVE10", percentOff: 10 } });
    expect(r.discountCents).toBe(250);
    expect(r.taxCents).toBe(180); // 8% of 2250
    expect(r.totalCents).toBe(2430);
  });

  test("coupon percent is clamped to 100", () => {
    const r = priceOrder(items, { coupon: { code: "FREE", percentOff: 250 } });
    expect(r.discountCents).toBe(2500);
    expect(r.totalCents).toBe(0);
  });
});
