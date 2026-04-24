import assert from "node:assert/strict";
import { buildHttpOptions } from "./http-adapter.mjs";

// -1 is axios's "unlimited" sentinel. Must be translated to Infinity so
// follow-redirects doesn't apply its own 10 MB default.
const unlimited = buildHttpOptions({
  maxBodyLength: -1,
  hostname: "example.com",
  port: 80,
  method: "POST",
});
assert.strictEqual(
  unlimited.maxBodyLength,
  Infinity,
  "maxBodyLength=-1 (unlimited) should map to Infinity"
);

// Explicit positive limit: passes through unchanged.
const limited = buildHttpOptions({
  maxBodyLength: 1_000_000,
  hostname: "example.com",
  port: 80,
  method: "POST",
});
assert.strictEqual(limited.maxBodyLength, 1_000_000, "explicit limit preserved");

// Other options untouched (guard against accidental scope creep in the fix).
assert.strictEqual(unlimited.hostname, "example.com");
assert.strictEqual(unlimited.port, 80);
assert.strictEqual(unlimited.method, "POST");

console.log("http-adapter tests passed");
