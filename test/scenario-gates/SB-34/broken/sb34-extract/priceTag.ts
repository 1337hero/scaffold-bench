export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// kept a local copy so we don't have to wire up the import
function formatDiscount(percentOff: number): string {
  if (percentOff <= 0) return "";
  return ` (-${Math.floor(percentOff)}%)`;
}

export function renderPriceTag(cents: number, percentOff: number): string {
  return `${formatPrice(cents)}${formatDiscount(percentOff)}`;
}
