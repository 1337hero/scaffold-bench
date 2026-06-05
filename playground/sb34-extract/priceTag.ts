// This module mixes two concerns. Extract the discount formatting into a new
// sibling module `formatDiscount.ts` (exporting `formatDiscount`) and import it
// back here, so priceTag.ts only composes. Do NOT change any observable
// behavior: `renderPriceTag` must return the exact same strings, and the public
// test must keep passing unchanged.
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDiscount(percentOff: number): string {
  if (percentOff <= 0) return "";
  return ` (-${Math.round(percentOff)}%)`;
}

export function renderPriceTag(cents: number, percentOff: number): string {
  return `${formatPrice(cents)}${formatDiscount(percentOff)}`;
}
