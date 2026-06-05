// EXISTING tests for the receipts subsystem. These must stay green — your change
// to invoices.ts must not break them.
import { describe, test, expect } from "bun:test";
import { renderReceipt, receiptTotal, type Receipt } from "./receipts";

const r: Receipt = { id: "R1", currency: "EUR", lineCents: [1099, 250, 51] };

describe("receipts (existing)", () => {
  test("receiptTotal sums lines", () => {
    expect(receiptTotal(r)).toBe(1400);
  });

  test("renderReceipt uses the shared money formatter (EUR symbol)", () => {
    expect(renderReceipt(r)).toBe("Receipt R1: €14.00");
  });
});
