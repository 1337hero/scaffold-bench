// Order pricing engine. This module already ships and is covered by
// pricing.test.ts — every existing behavior here must keep working.

export interface LineItem {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Coupon {
  code: string;
  /** Percent off the subtotal, 0-100. */
  percentOff: number;
}

export interface PriceResult {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

const TAX_RATE = 0.08;

export function subtotal(items: LineItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
}

function couponDiscount(sub: number, coupon: Coupon | null): number {
  if (!coupon) return 0;
  if (coupon.percentOff <= 0) return 0;
  const pct = Math.min(coupon.percentOff, 100);
  return Math.round((sub * pct) / 100);
}

export interface PriceOptions {
  coupon?: Coupon | null;
}

export function priceOrder(items: LineItem[], options: PriceOptions = {}): PriceResult {
  const sub = subtotal(items);
  // BUG: applies the 5% volume discount to every order, regressing small ones.
  const volume = Math.round((sub * 5) / 100);
  const discount = volume + couponDiscount(sub, options.coupon ?? null);
  const taxable = sub - discount;
  const tax = Math.round(taxable * TAX_RATE);
  return {
    subtotalCents: sub,
    discountCents: discount,
    taxCents: tax,
    totalCents: taxable + tax,
  };
}
