import assert from "node:assert/strict";
import { buildTimeoutError, AxiosError } from "./buildTimeoutError.mjs";

// Default path: no custom message configured.
const e1 = buildTimeoutError({}, 250);
assert.ok(e1 instanceof AxiosError, "returns an AxiosError");
assert.strictEqual(e1.message, "timeout of 250ms exceeded", "default message intact");
assert.strictEqual(e1.code, "ECONNABORTED");

// Custom message path: user-configured string must override the default.
const e2 = buildTimeoutError({ timeoutErrorMessage: "oops, timeout" }, 250);
assert.strictEqual(
  e2.message,
  "oops, timeout",
  "custom timeoutErrorMessage should override the default"
);
assert.strictEqual(e2.code, "ECONNABORTED", "error code unchanged");

// Edge: empty string should be treated as "not set" — keep default.
// (Axios's own semantics: falsy means fall through to default.)
const e3 = buildTimeoutError({ timeoutErrorMessage: "" }, 100);
assert.strictEqual(e3.message, "timeout of 100ms exceeded", "empty string falls through to default");

console.log("buildTimeoutError tests passed");
