import { normalizeTag } from "./normalizeTag.mjs";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}" but got "${actual}"`);
  }
}

assertEqual(normalizeTag("  Product Launch  "), "product-launch", "trims and lowercases");
assertEqual(
  normalizeTag("Client__Priority  High"),
  "client-priority-high",
  "converts underscores and spaces"
);
assertEqual(
  normalizeTag("--Already---Loud__Tag--"),
  "already-loud-tag",
  "collapses repeated separators and trims separator edges"
);

console.log("normalizeTag tests passed");
