// Hidden correctness test for SB-32. Runs from the fixture's __hidden__/ subdir.
// Parses the returned markup and asserts the a11y contract a screen reader needs:
// every input is programmatically labelled (id + matching <label for>), and the
// submit button has an accessible name (text or aria-label).
import { test, expect } from "bun:test";
import { searchFormHtml } from "../searchForm";

const html = searchFormHtml();

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m ? (m[1] ?? "") : null;
}

test("every input has an id with a matching <label for>", () => {
  const inputs = html.match(/<input\b[^>]*>/g) ?? [];
  expect(inputs.length).toBeGreaterThan(0);
  const forTargets = new Set(
    [...html.matchAll(/<label\b[^>]*\bfor\s*=\s*"([^"]*)"/g)].map((m) => m[1])
  );
  for (const input of inputs) {
    const id = attr(input, "id");
    expect(id, `input is missing an id: ${input}`).toBeTruthy();
    expect(forTargets.has(id ?? ""), `no <label for> targets ${id}`).toBe(true);
  }
});

test("the submit button exposes an accessible name", () => {
  const button = (html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/) ?? [])[0] ?? "";
  expect(button).toBeTruthy();
  const ariaLabel = attr(button, "aria-label");
  const visibleText = button
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  expect(Boolean(ariaLabel) || visibleText.length > 0).toBe(true);
});

test("it is still a search form", () => {
  expect(/role\s*=\s*"search"/.test(html)).toBe(true);
});
