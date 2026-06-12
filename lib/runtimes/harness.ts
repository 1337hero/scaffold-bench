import type { ToolCallParts } from "./local-model.ts";

export type HarnessName = "native" | "hermes" | "qwen";

export interface Harness {
  name: HarnessName;
  prepare(input: { systemPrompt: string; tools: object[] }): {
    systemPrompt: string;
    requestTools: object[] | undefined;
  };
  parse(content: string): { content: string; toolCalls: ToolCallParts[] };
}

const native: Harness = {
  name: "native",
  prepare: ({ systemPrompt, tools }) => ({ systemPrompt, requestTools: tools }),
  parse: (content) => ({ content, toolCalls: [] }),
};

function taggedHarness(name: HarnessName, tag: string): Harness {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>\\s*`, "g");
  return {
    name,
    prepare: ({ systemPrompt, tools }) => ({
      systemPrompt: [
        systemPrompt,
        "",
        "You have access to the following tools. Tool schemas are provided inside <tools></tools>:",
        "<tools>",
        ...tools.map((tool) => JSON.stringify(tool)),
        "</tools>",
        "",
        `To call a tool, emit exactly one JSON object per call wrapped in <${tag}></${tag}> tags, like:`,
        `<${tag}>{"name": "tool-name", "arguments": {"arg": "value"}}</${tag}>`,
      ].join("\n"),
      requestTools: undefined,
    }),
    parse: (content) => {
      const toolCalls: ToolCallParts[] = [];
      const cleaned = content.replace(block, (match, body: string) => {
        const call = parseTaggedCall(body, toolCalls.length);
        if (!call) return match;
        toolCalls.push(call);
        return "";
      });
      return { content: cleaned.trim(), toolCalls };
    },
  };
}

function parseTaggedCall(body: string, index: number): ToolCallParts | undefined {
  try {
    const parsed = JSON.parse(body) as { name?: unknown; arguments?: unknown };
    if (typeof parsed.name !== "string" || !parsed.name) return undefined;
    const args =
      typeof parsed.arguments === "string"
        ? parsed.arguments
        : JSON.stringify(parsed.arguments ?? {});
    return { id: `call_${index}`, name: parsed.name, arguments: args };
  } catch {
    return undefined;
  }
}

export const HARNESSES: Record<HarnessName, Harness> = {
  native,
  hermes: taggedHarness("hermes", "tool_call"),
  qwen: taggedHarness("qwen", "function_call"),
};

export function resolveHarness(name: string | undefined): Harness {
  if (name === undefined) return HARNESSES.native;
  const harness = HARNESSES[name as HarnessName];
  if (!harness) throw new Error(`unknown harness "${name}"`);
  return harness;
}
