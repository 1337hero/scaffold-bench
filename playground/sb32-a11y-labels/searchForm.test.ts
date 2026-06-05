import { test, expect } from "bun:test";
import { searchFormHtml } from "./searchForm";

test("the search input is labelled", () => {
  const html = searchFormHtml();
  const id = (html.match(/<input\b[^>]*\bid\s*=\s*"([^"]*)"/) ?? [])[1];
  expect(id).toBeTruthy();
  expect(new RegExp(`<label\\b[^>]*\\bfor\\s*=\\s*"${id}"`).test(html)).toBe(true);
});

test("the submit button has an accessible name", () => {
  const html = searchFormHtml();
  const button = (html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/) ?? [])[0] ?? "";
  const ariaLabel = /aria-label\s*=\s*"[^"]+"/.test(button);
  const text = button
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  expect(ariaLabel || text.length > 0).toBe(true);
});
