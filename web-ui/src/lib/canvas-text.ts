export function wrapText(
  measure: (text: string) => number,
  text: string,
  maxWidth: number
): string[] {
  if (text.length === 0) return [""];

  const blocks = text.split("\n");
  const lines: string[] = [];

  for (const block of blocks) {
    if (block.length === 0) {
      lines.push("");
      continue;
    }

    const words = block.split(/\s+/).filter((w) => w.length > 0);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (measure(word) <= maxWidth) {
        current = word;
      } else {
        const broken = breakLongWord(measure, word, maxWidth);
        lines.push(...broken.slice(0, -1));
        current = broken.at(-1) ?? "";
      }
    }

    lines.push(current);
  }

  return lines;
}

function breakLongWord(
  measure: (text: string) => number,
  word: string,
  maxWidth: number
): string[] {
  const out: string[] = [];
  let chunk = "";

  for (const ch of word) {
    const next = chunk + ch;
    if (chunk.length > 0 && measure(next) > maxWidth) {
      out.push(chunk);
      chunk = ch;
    } else {
      chunk = next;
    }
  }

  out.push(chunk);
  return out;
}
