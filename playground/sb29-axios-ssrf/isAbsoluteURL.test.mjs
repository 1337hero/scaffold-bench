import assert from "node:assert/strict";
import isAbsoluteURL from "./isAbsoluteURL.mjs";

// True absolute URLs: must stay true.
assert.strictEqual(isAbsoluteURL("http://example.com/"), true);
assert.strictEqual(isAbsoluteURL("https://example.com/"), true);
assert.strictEqual(isAbsoluteURL("ftp://example.com/"), true);
assert.strictEqual(isAbsoluteURL("custom-scheme://x/"), true);

// SSRF fix (CVE-2024-39338): protocol-relative URLs must be treated as
// RELATIVE. Treating them as absolute lets an attacker redirect server-side
// fetches to arbitrary hosts. See https://security.snyk.io/vuln/SNYK-JS-AXIOS-7361793
assert.strictEqual(
  isAbsoluteURL("//example.com/"),
  false,
  "protocol-relative URLs must be relative (CVE-2024-39338)"
);
assert.strictEqual(
  isAbsoluteURL("//attacker.internal/secrets"),
  false,
  "protocol-relative URLs must be relative (CVE-2024-39338)"
);

// Plain relative URLs: stay false.
assert.strictEqual(isAbsoluteURL("/path"), false);
assert.strictEqual(isAbsoluteURL("path/to/thing"), false);
assert.strictEqual(isAbsoluteURL("./relative"), false);

// Malformed scheme: stay false.
assert.strictEqual(isAbsoluteURL("!invalid://x/"), false);

console.log("isAbsoluteURL tests passed");
