// Extracted from axios lib/adapters/http.js at commit 9bb016f9 — the
// request-timeout handler slice. Real file is ~500 lines; this captures
// exactly the bit that ignores config.timeoutErrorMessage.
// Original: https://github.com/axios/axios/blob/master/lib/adapters/http.js

export class AxiosError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "AxiosError";
    this.code = code;
  }
}

AxiosError.ECONNABORTED = "ECONNABORTED";
AxiosError.ETIMEDOUT = "ETIMEDOUT";

/**
 * Builds the AxiosError thrown when a request hits its timeout.
 * BUG: the error message is hard-coded to "timeout of Xms exceeded" and
 * ignores the user-configured `config.timeoutErrorMessage`, so the
 * documented override has no effect under the Node adapter.
 */
export function buildTimeoutError(config, timeout) {
  return new AxiosError(
    "timeout of " + timeout + "ms exceeded",
    AxiosError.ECONNABORTED
  );
}
