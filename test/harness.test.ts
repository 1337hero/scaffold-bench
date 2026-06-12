import { describe, expect, it } from "bun:test";
import { resolveHarness } from "../lib/runtimes/harness.ts";
import { openAiTools } from "../lib/runtimes/local-tools.ts";

describe("resolveHarness", () => {
  it("defaults to native, which passes tools through and parses nothing", () => {
    const harness = resolveHarness(undefined);
    expect(harness.name).toBe("native");
    const prepared = harness.prepare({ systemPrompt: "sys", tools: openAiTools });
    expect(prepared.systemPrompt).toBe("sys");
    expect(prepared.requestTools).toBe(openAiTools);
    const parsed = harness.parse("hello <tool_call>{}</tool_call>");
    expect(parsed.content).toBe("hello <tool_call>{}</tool_call>");
    expect(parsed.toolCalls).toEqual([]);
  });

  it("throws on an unknown harness name", () => {
    expect(() => resolveHarness("nope")).toThrow();
  });
});

describe("hermes harness", () => {
  const hermes = resolveHarness("hermes");

  it("embeds all tool schemas in the system prompt and omits request tools", () => {
    const prepared = hermes.prepare({ systemPrompt: "sys", tools: openAiTools });
    expect(prepared.requestTools).toBeUndefined();
    expect(prepared.systemPrompt).toStartWith("sys");
    expect(prepared.systemPrompt).toContain("<tools>");
    for (const tool of openAiTools) {
      expect(prepared.systemPrompt).toContain(`"${tool.function.name}"`);
    }
    expect(prepared.systemPrompt).toContain("<tool_call>");
  });

  it("parses a single tagged tool call and cleans the content", () => {
    const parsed = hermes.parse(
      'On it. <tool_call>{"name": "read", "arguments": {"path": "a.ts"}}</tool_call>'
    );
    expect(parsed.content).toBe("On it.");
    expect(parsed.toolCalls).toEqual([
      { id: "call_0", name: "read", arguments: '{"path":"a.ts"}' },
    ]);
  });

  it("parses multiple calls with stable sequential ids", () => {
    const parsed = hermes.parse(
      '<tool_call>{"name": "ls", "arguments": {}}</tool_call><tool_call>{"name": "read", "arguments": {"path": "b"}}</tool_call>'
    );
    expect(parsed.toolCalls.map((c) => c.id)).toEqual(["call_0", "call_1"]);
    expect(parsed.toolCalls.map((c) => c.name)).toEqual(["ls", "read"]);
  });

  it("accepts arguments given as a JSON string", () => {
    const parsed = hermes.parse(
      '<tool_call>{"name": "bash", "arguments": "{\\"command\\": \\"ls\\"}"}</tool_call>'
    );
    expect(parsed.toolCalls[0].arguments).toBe('{"command": "ls"}');
  });

  it("skips malformed JSON blocks, leaving them in content", () => {
    const parsed = hermes.parse("<tool_call>{not json}</tool_call> hi");
    expect(parsed.toolCalls).toEqual([]);
    expect(parsed.content).toContain("{not json}");
  });
});

describe("qwen harness", () => {
  const qwen = resolveHarness("qwen");

  it("uses function_call tags for prepare and parse", () => {
    const prepared = qwen.prepare({ systemPrompt: "sys", tools: openAiTools });
    expect(prepared.requestTools).toBeUndefined();
    expect(prepared.systemPrompt).toContain("<function_call>");
    const parsed = qwen.parse('<function_call>{"name": "ls", "arguments": {}}</function_call>done');
    expect(parsed.content).toBe("done");
    expect(parsed.toolCalls).toEqual([{ id: "call_0", name: "ls", arguments: "{}" }]);
  });
});
