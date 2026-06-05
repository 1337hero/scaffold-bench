import { formatMoney } from "./format";

export interface Invoice {
  id: string;
  currency: string;
  amountCents: number;
}

export function renderInvoice(inv: Invoice): string {
  return `Invoice ${inv.id}: ${formatMoney({ currency: inv.currency, cents: inv.amountCents })}`;
}
