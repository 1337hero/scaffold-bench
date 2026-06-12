export function declarationsFor(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g");
  const decls: Record<string, string> = {};

  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const block = match[1];
    const propRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);?/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRegex.exec(block)) !== null) {
      decls[propMatch[1].trim()] = propMatch[2].trim();
    }
  }

  return decls;
}

export function hasImportant(css: string): boolean {
  return /!\s*important/i.test(css);
}

export function mediaQueryBlocks(css: string): Array<{ query: string; content: string }> {
  const results: Array<{ query: string; content: string }> = [];
  const regex = /@media\s*([^{]+)\{([\s\S]*?\})\s*\}/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    results.push({
      query: match[1].trim(),
      content: match[2].trim(),
    });
  }

  return results;
}

export function customPropertyScope(css: string, name: string): string[] {
  const selectors: string[] = [];
  const propPattern = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`([^{}]+)\\{[^}]*${propPattern}\\s*:[^}]*\\}`, "g");

  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const selectorPart = match[1].trim();
    const lastSelector = selectorPart.split(/[,{]/).pop()?.trim();
    if (lastSelector) {
      selectors.push(lastSelector);
    }
  }

  return selectors;
}
