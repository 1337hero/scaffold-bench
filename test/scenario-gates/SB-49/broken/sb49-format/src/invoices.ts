export interface Invoice {
  id: string;
  currency: string;
  amountCents: number;
}

// Reimplements the shared abstraction instead of reusing it, and still gets the
// non-USD symbols wrong.
function formatMoney(currency: string, cents: number): string {
  const symbol = currency === "USD" ? "$" : "?";
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${symbol}${whole}.${fraction}`;
}

export function renderInvoice(inv: Invoice): string {
  return `Invoice ${inv.id}: ${formatMoney(inv.currency, inv.amountCents)}`;
}
