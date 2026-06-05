import { formatDiscount } from "./formatDiscount";

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function renderPriceTag(cents: number, percentOff: number): string {
  return `${formatPrice(cents)}${formatDiscount(percentOff)}`;
}
