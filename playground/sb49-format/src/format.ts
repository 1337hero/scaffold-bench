// Shared formatting abstraction used across subsystems. This is the ONE place
// money formatting lives — both invoices and receipts depend on it. Reuse it;
// do not copy its logic into other modules.

export interface MoneyParts {
  currency: string;
  cents: number;
}

const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function currencySymbol(currency: string): string {
  return SYMBOLS[currency] ?? currency + " ";
}

export function formatMoney(parts: MoneyParts): string {
  const symbol = currencySymbol(parts.currency);
  const sign = parts.cents < 0 ? "-" : "";
  const abs = Math.abs(parts.cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${symbol}${whole}.${fraction}`;
}
