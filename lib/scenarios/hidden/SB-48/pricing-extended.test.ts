// Hidden authoritative checker for SB-48. Runs from the fixture's __hidden__/
// subdir, importing the submitted module via ../pricing. Asserts BOTH the
// preserved existing behavior AND the new volume-discount behavior.
import { describe, test, expect } from "bun:test";
import { priceOrder, subtotal, type LineItem } from "../pricing";

const small: LineItem[] = [
  { sku: "a", unitPriceCents: 1000, quantity: 2 },
  { sku: "b", unitPriceCents: 500, quantity: 1 },
]; // subtotal 2500

describe("SB-48 hidden: preserved existing behavior", () => {
  test("subtotal still sums correctly", () => {
    expect(subtotal(small)).toBe(2500);
  });

  test("small order, no coupon: unchanged", () => {
    const r = priceOrder(small);
    expect(r).toEqual({ subtotalCents: 2500, discountCents: 0, taxCents: 200, totalCents: 2700 });
  });

  test("small order, coupon: unchanged (no volume discount applies)", () => {
    const r = priceOrder(small, { coupon: { code: "SAVE10", percentOff: 10 } });
    expect(r.discountCents).toBe(250);
    expect(r.totalCents).toBe(2430);
  });
});

describe("SB-48 hidden: new volume discount", () => {
  const big: LineItem[] = [{ sku: "x", unitPriceCents: 10000, quantity: 2 }]; // subtotal 20000

  test("at threshold (exactly 10000) volume discount applies", () => {
    const r = priceOrder([{ sku: "t", unitPriceCents: 10000, quantity: 1 }]);
    expect(r.discountCents).toBe(500); // 5% of 10000
    expect(r.subtotalCents).toBe(10000);
  });

  test("just under threshold: no volume discount", () => {
    const r = priceOrder([{ sku: "u", unitPriceCents: 9999, quantity: 1 }]);
    expect(r.discountCents).toBe(0);
  });

  test("volume discount applied before coupon, combined in discountCents", () => {
    const r = priceOrder(big, { coupon: { code: "SAVE10", percentOff: 10 } });
    expect(r.discountCents).toBe(2900); // 1000 volume + 1900 coupon
    expect(r.taxCents).toBe(1368);
    expect(r.totalCents).toBe(18468);
  });

  test("volume discount alone (no coupon)", () => {
    const r = priceOrder(big);
    expect(r.discountCents).toBe(1000);
    expect(r.taxCents).toBe(Math.round((20000 - 1000) * 0.08));
    expect(r.totalCents).toBe(20000 - 1000 + Math.round(19000 * 0.08));
  });
});
