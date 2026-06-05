// Receipts subsystem. Already shipped and tested — must keep working unchanged.
import { formatMoney } from "./format";

export interface Receipt {
  id: string;
  currency: string;
  lineCents: number[];
}

export function receiptTotal(r: Receipt): number {
  return r.lineCents.reduce((a, b) => a + b, 0);
}

export function renderReceipt(r: Receipt): string {
  const total = receiptTotal(r);
  return `Receipt ${r.id}: ${formatMoney({ currency: r.currency, cents: total })}`;
}
