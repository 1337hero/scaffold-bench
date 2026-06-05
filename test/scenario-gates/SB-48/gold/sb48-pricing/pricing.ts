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
const VOLUME_THRESHOLD_CENTS = 10000;
const VOLUME_PERCENT = 5;

export function subtotal(items: LineItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
}

function couponDiscount(amount: number, coupon: Coupon | null): number {
  if (!coupon) return 0;
  if (coupon.percentOff <= 0) return 0;
  const pct = Math.min(coupon.percentOff, 100);
  return Math.round((amount * pct) / 100);
}

export interface PriceOptions {
  coupon?: Coupon | null;
}

export function priceOrder(items: LineItem[], options: PriceOptions = {}): PriceResult {
  const sub = subtotal(items);
  const volume = sub >= VOLUME_THRESHOLD_CENTS ? Math.round((sub * VOLUME_PERCENT) / 100) : 0;
  const afterVolume = sub - volume;
  const coupon = couponDiscount(afterVolume, options.coupon ?? null);
  const discount = volume + coupon;
  const taxable = sub - discount;
  const tax = Math.round(taxable * TAX_RATE);
  return {
    subtotalCents: sub,
    discountCents: discount,
    taxCents: tax,
    totalCents: taxable + tax,
  };
}
