export function formatDiscount(percentOff: number): string {
  if (percentOff <= 0) return "";
  return ` (-${Math.round(percentOff)}%)`;
}
