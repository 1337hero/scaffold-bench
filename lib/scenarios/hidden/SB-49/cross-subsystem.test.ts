// Hidden authoritative checker for SB-49. Runs from the fixture's __hidden__/
// subdir, importing the submitted modules via ../src. Asserts the changed
// subsystem (invoices) now formats every currency correctly AND the untouched
// subsystem (receipts) still works.
import { describe, test, expect } from "bun:test";
import { renderInvoice } from "../src/invoices";
import { renderReceipt, type Receipt } from "../src/receipts";

describe("SB-49 hidden: invoices fixed across currencies", () => {
  test("USD", () => {
    expect(renderInvoice({ id: "I1", currency: "USD", amountCents: 12345 })).toBe("Invoice I1: $123.45");
  });
  test("EUR", () => {
    expect(renderInvoice({ id: "I2", currency: "EUR", amountCents: 5000 })).toBe("Invoice I2: €50.00");
  });
  test("GBP", () => {
    expect(renderInvoice({ id: "I3", currency: "GBP", amountCents: 99 })).toBe("Invoice I3: £0.99");
  });
});

describe("SB-49 hidden: receipts subsystem still green", () => {
  test("renderReceipt unchanged", () => {
    const r: Receipt = { id: "R1", currency: "EUR", lineCents: [1099, 250, 51] };
    expect(renderReceipt(r)).toBe("Receipt R1: €14.00");
  });
});
