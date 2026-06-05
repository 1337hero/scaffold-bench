import { test, expect } from "bun:test";
import { normalizeTag } from "./normalizeTag.mjs";

test("trims and lowercases", () => {
  expect(normalizeTag("  Product Launch  ")).toBe("product-launch");
});

test("converts underscores and spaces to dashes", () => {
  expect(normalizeTag("Client__Priority  High")).toBe("client-priority-high");
});

test("collapses repeated separators and trims separator edges", () => {
  expect(normalizeTag("--Already---Loud__Tag--")).toBe("already-loud-tag");
});
