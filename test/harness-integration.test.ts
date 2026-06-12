import { afterEach, describe, expect, test } from "bun:test";
import { resolveHarness } from "../lib/runtimes/harness.ts";
import { callModel } from "../lib/runtimes/local-model.ts";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function sseResponse(content: string): Response {
  const payload = JSON.stringify({
    choices: [{ index: 0, delta: { content }, finish_reason: "stop" }],
  });
  return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

describe("callModel with a tag harness", () => {
  test("omits the tools param and parses tagged calls into tool_calls", async () => {
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return sseResponse(
        '<think>plan</think>Reading. <tool_call>{"name": "read", "arguments": {"path": "a.ts"}}</tool_call>'
      );
    }) as typeof fetch;

    const result = await callModel(
      [{ role: "user", content: "hi" }],
      performance.now() + 5_000,
      {
        endpoint: "http://localhost:9/v1/chat/completions",
        model: "test-model",
        apiKey: undefined,
        harness: resolveHarness("hermes"),
      },
      undefined
    );

    expect(requestBody.tools).toBeUndefined();
    expect(result.finishReason).toBe("tool_calls");
    expect(result.message?.tool_calls).toEqual([
      {
        id: "call_0",
        type: "function",
        function: { name: "read", arguments: '{"path":"a.ts"}' },
      },
    ]);
    expect(result.message?.content).toBe("Reading.");
  });

  test("native harness behavior is unchanged", async () => {
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return sseResponse("plain answer");
    }) as typeof fetch;

    const result = await callModel(
      [{ role: "user", content: "hi" }],
      performance.now() + 5_000,
      { endpoint: "http://localhost:9/v1/chat/completions", model: "m", apiKey: undefined },
      [{ type: "function", function: { name: "read" } }]
    );

    expect(Array.isArray(requestBody.tools)).toBe(true);
    expect(result.finishReason).toBe("stop");
    expect(result.message?.content).toBe("plain answer");
  });
});
