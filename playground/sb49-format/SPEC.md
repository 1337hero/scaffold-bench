# Fix invoices currency formatting — reuse the shared abstraction

Two subsystems share one money-formatting abstraction:
- `src/format.ts` — the single source of truth (`formatMoney`, `currencySymbol`).
- `src/receipts.ts` — already uses it correctly (shipped + tested).
- `src/invoices.ts` — does NOT use it: `renderInvoice` hardcodes a `$` and
  reimplements formatting inline, so EUR/GBP invoices render with the wrong
  symbol.

## Task
Fix `renderInvoice` so it respects the invoice's `currency`, by **reusing the
shared `formatMoney` from `src/format.ts`** — do not reimplement money
formatting and do not redefine `formatMoney` or `currencySymbol` inside
`invoices.ts`.

## Constraints
- Edit only `src/invoices.ts`.
- Do not touch `src/format.ts` or `src/receipts.ts` — the receipts tests must
  stay green.
- Keep the `renderInvoice` signature and the `Invoice` interface.
- The rendered string format is `Invoice <id>: <formatted money>` where the
  money part comes from `formatMoney`.

## Done when
- `renderInvoice({ id, currency: "USD", amountCents })` → `Invoice <id>: $X.YY`.
- `renderInvoice({ id, currency: "EUR", amountCents })` → `Invoice <id>: €X.YY`.
- `renderInvoice({ id, currency: "GBP", amountCents })` → `Invoice <id>: £X.YY`.
- `src/receipts.test.ts` still passes.
- `invoices.ts` imports and calls `formatMoney` rather than redefining it.
