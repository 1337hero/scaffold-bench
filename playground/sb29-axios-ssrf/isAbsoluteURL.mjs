// Extracted from axios lib/helpers/isAbsoluteURL.js at commit c6cce43c —
// the file shipped as-is, carrying CVE-2024-39338.
// Original: https://github.com/axios/axios/blob/master/lib/helpers/isAbsoluteURL.js

/**
 * Determines whether the specified URL is absolute.
 *
 * @param {string} url - URL to analyze.
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
export default function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}
