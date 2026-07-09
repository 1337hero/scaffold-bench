export type HtmlExtraction = {
  html: string;
  source: "fence" | "raw";
};

const FENCE_RE = /```(?:html|HTML)?\s*\n([\s\S]*?)```/g;
const DOCTYPE_RE = /<!DOCTYPE\s+html/i;
const HTML_OPEN_RE = /<html[\s>]/i;

export function extractHtml(text: string): HtmlExtraction | null {
  if (!text) return null;

  for (const match of text.matchAll(FENCE_RE)) {
    const body = match[1].trim();
    if (looksLikeHtml(body)) {
      return { html: body, source: "fence" };
    }
  }

  const docStart = findIndex(text, DOCTYPE_RE);
  const htmlStart = findIndex(text, HTML_OPEN_RE);
  const start = minNonNegative(docStart, htmlStart);
  if (start === -1) return null;

  const closeIdx = text.toLowerCase().lastIndexOf("</html>");
  const end = closeIdx >= start ? closeIdx + "</html>".length : text.length;

  return { html: text.slice(start, end).trim(), source: "raw" };
}

function looksLikeHtml(body: string): boolean {
  return DOCTYPE_RE.test(body) || HTML_OPEN_RE.test(body) || /<body[\s>]/i.test(body);
}

function findIndex(text: string, re: RegExp): number {
  const match = re.exec(text);
  return match ? match.index : -1;
}

function minNonNegative(a: number, b: number): number {
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}
