import { afterEach, describe, expect, test } from "bun:test";
import { callModel } from "../lib/runtimes/local-model.ts";
import { classifyRuntimeError, runtimeErrorEvaluation } from "../lib/scoring.ts";
import { DEFAULT_LOCAL_ENDPOINT } from "../lib/config/env.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const LOCAL_CHAT_ENDPOINT = `${DEFAULT_LOCAL_ENDPOINT}/v1/chat/completions`;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("callModel retries transient empty-body responses", () => {
  test("retries once and succeeds on next SSE response", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("");
      return new Response(
        'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        {
          headers: { "content-type": "text/event-stream" },
        }
      );
    }) as typeof fetch;

    const result = await callModel(
      [{ role: "user", content: "hi" }],
      performance.now() + 5_000,
      {
        endpoint: LOCAL_CHAT_ENDPOINT,
        model: "test-model",
        apiKey: undefined,
      },
      []
    );

    expect(result.message?.content).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("runtime error classification", () => {
  test("marks model endpoint empty-body crashes as score-exempt infra errors", () => {
    const error = `CRASH: empty response body from ${LOCAL_CHAT_ENDPOINT}`;
    expect(classifyRuntimeError(error)).toEqual({ kind: "infra", scoreExempt: true });

    const evaluation = runtimeErrorEvaluation(error, 2);
    expect(evaluation.status).toBe("fail");
    expect(evaluation.maxPoints).toBe(0);
    expect(evaluation.summary).toContain("excluded from scoring");
  });

  test("keeps normal runtime errors scoreful", () => {
    const error = "CRASH: missing assistant message";
    expect(classifyRuntimeError(error)).toEqual({ kind: "runtime", scoreExempt: false });

    const evaluation = runtimeErrorEvaluation(error, 2);
    expect(evaluation.maxPoints).toBe(2);
    expect(evaluation.summary).toBe(`Runtime error: ${error}`);
  });
});
