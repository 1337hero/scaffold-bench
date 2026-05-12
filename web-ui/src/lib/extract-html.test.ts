import { describe, expect, test } from "bun:test";
import { extractHtml } from "./extract-html";

describe("extractHtml", () => {
  test("returns null for empty input", () => {
    expect(extractHtml("")).toBeNull();
  });

  test("returns null when no html-ish content", () => {
    expect(extractHtml("Here is a plain text response with no markup.")).toBeNull();
  });

  test("pulls html from a ```html fenced block", () => {
    const text = "Sure!\n\n```html\n<!DOCTYPE html><html><body>hi</body></html>\n```\n\nDone.";
    const result = extractHtml(text);
    expect(result?.source).toBe("fence");
    expect(result?.html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(result?.html.includes("</html>")).toBe(true);
  });

  test("pulls html from an unlabeled fenced block", () => {
    const text = "```\n<html><body><p>hi</p></body></html>\n```";
    const result = extractHtml(text);
    expect(result?.source).toBe("fence");
    expect(result?.html.startsWith("<html>")).toBe(true);
  });

  test("skips non-html fenced blocks and falls back", () => {
    const text = "```js\nconsole.log('hi');\n```\n<!DOCTYPE html><html></html>";
    const result = extractHtml(text);
    expect(result?.source).toBe("raw");
    expect(result?.html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  test("extracts raw doctype-to-close-html slice when no fence", () => {
    const text = "Here is the file:\n<!DOCTYPE html><html><body>x</body></html>\nThat's it.";
    const result = extractHtml(text);
    expect(result?.source).toBe("raw");
    expect(result?.html).toBe("<!DOCTYPE html><html><body>x</body></html>");
  });

  test("extracts from bare <html> when no doctype present", () => {
    const text = "<html><body>x</body></html>";
    const result = extractHtml(text);
    expect(result?.source).toBe("raw");
    expect(result?.html).toBe("<html><body>x</body></html>");
  });

  test("handles streaming output with no closing </html>", () => {
    const text = "<!DOCTYPE html><html><body><p>partial...";
    const result = extractHtml(text);
    expect(result?.source).toBe("raw");
    expect(result?.html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  test("prefers the first valid fenced block over later raw content", () => {
    const text =
      "```html\n<!DOCTYPE html><html><body>first</body></html>\n```\n\n<html><body>second</body></html>";
    const result = extractHtml(text);
    expect(result?.source).toBe("fence");
    expect(result?.html.includes("first")).toBe(true);
  });
});
