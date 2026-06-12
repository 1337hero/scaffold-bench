const THINK_BLOCK = /<(think|thinking)>([\s\S]*?)<\/\1>\s*/gi;
const UNCLOSED_THINK = /<(think|thinking)>([\s\S]*)$/i;

export function stripThink(content: string): { content: string; reasoning: string } {
  const reasoningParts: string[] = [];
  let cleaned = content.replace(THINK_BLOCK, (_, _tag, body: string) => {
    reasoningParts.push(body.trim());
    return "";
  });
  cleaned = cleaned.replace(UNCLOSED_THINK, (_, _tag, body: string) => {
    reasoningParts.push(body.trim());
    return "";
  });
  return { content: cleaned.trimStart(), reasoning: reasoningParts.join("\n") };
}
