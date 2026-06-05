// Invoices subsystem. Currently formats money with a hardcoded "$" and ignores
// the invoice currency — see SPEC.md for the change you need to make.

export interface Invoice {
  id: string;
  currency: string;
  amountCents: number;
}

export function renderInvoice(inv: Invoice): string {
  // BUG: hardcodes the dollar sign and reimplements formatting inline instead
  // of using the shared abstraction, so EUR/GBP invoices render incorrectly.
  const whole = Math.floor(inv.amountCents / 100);
  const fraction = String(inv.amountCents % 100).padStart(2, "0");
  return `Invoice ${inv.id}: $${whole}.${fraction}`;
}
