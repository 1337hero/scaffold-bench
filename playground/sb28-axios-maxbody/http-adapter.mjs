// Extracted from axios lib/adapters/http.js at commit c30252f6 — only the
// options-building slice that carries the bug. Real adapter is ~500 lines.
// Original: https://github.com/axios/axios/blob/master/lib/adapters/http.js

export function buildHttpOptions(config) {
  const options = {
    hostname: config.hostname,
    port: config.port,
    method: config.method,
  };

  if (config.maxBodyLength > -1) {
    options.maxBodyLength = config.maxBodyLength;
  }
  // BUG: no else-branch. When caller passes -1 (axios convention for
  // "unlimited"), options.maxBodyLength stays undefined, so follow-redirects
  // applies its own 10 MB default — producing spurious 413s on large uploads.

  if (config.insecureHTTPParser) {
    options.insecureHTTPParser = config.insecureHTTPParser;
  }

  return options;
}
