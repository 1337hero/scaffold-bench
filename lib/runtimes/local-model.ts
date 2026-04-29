import { Either, Schema } from "effect";
import type { Ms, Ns, TokenCount } from "../schemas/index.js";
import { ChatStreamChunkSchema, nsToMs } from "../schemas/index.js";

export type FinishReason = "tool_calls" | "stop" | "length" | "content_filter";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
};

export type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type Timings = {
  prompt_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_ms?: number;
};

export type ModelMetricSource = {
  usage?: Usage;
  timings?: Timings;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

export type ModelCallMetrics = {
  promptTokens: TokenCount;
  completionTokens: TokenCount;
  totalTokens: TokenCount;
  totalRequestTimeMs: Ms;
  promptEvalTokens?: TokenCount;
  promptEvalTimeMs?: Ms;
  completionEvalTokens?: TokenCount;
  completionEvalTimeMs?: Ms;
};

export type CallModelConfig = {
  endpoint: string;
  model: string;
  apiKey: string | undefined;
  signal?: AbortSignal;
};

const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 120;

export async function callModel(
  conversation: ChatMessage[],
  deadline: number,
  config: CallModelConfig,
  tools: object[],
  onDelta?: (text: string) => void
): Promise<{
  finishReason: FinishReason;
  message?: ChatMessage;
  reasoning: string;
  metrics: ModelCallMetrics;
}> {
  const requestStartedAt = performance.now();
  const remainingMs = Math.max(1, Math.ceil(deadline - requestStartedAt));
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, remainingMs);
  const onAbort = () => controller.abort();

  if (config.signal?.aborted) onAbort();
  else config.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        const response = await fetch(config.endpoint, {
          method: "POST",
          headers: chatHeaders(config.apiKey),
          body: JSON.stringify({
            model: config.model,
            messages: conversation,
            stream: true,
            stream_options: { include_usage: true },
            tools,
          }),
          signal: controller.signal,
        });

        const stream = await readChatStream(response, config.endpoint, onDelta);
        const toolCalls = buildToolCalls(stream.toolCallsByIndex);
        const message: ChatMessage = {
          role: "assistant",
          content: stream.content,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        };

        return {
          finishReason: toolCalls.length ? "tool_calls" : stream.finishReason,
          message,
          reasoning: stream.reasoning,
          metrics: extractModelCallMetrics(
            { usage: stream.usage, timings: stream.timings },
            performance.now() - requestStartedAt
          ),
        };
      } catch (error) {
        lastError = error;
        if (timedOut || /timed out/i.test(errorMessage(error))) {
          throw new Error("TIMEOUT", { cause: error });
        }

        if (attempt >= MAX_TRANSIENT_RETRIES || !isTransientModelError(error, config.endpoint)) {
          throw error;
        }

        const timeLeftMs = deadline - performance.now();
        if (timeLeftMs <= 80) throw error;

        await sleep(Math.min(RETRY_BASE_DELAY_MS * (attempt + 1), Math.max(20, timeLeftMs - 40)));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  } finally {
    clearTimeout(timer);
    config.signal?.removeEventListener("abort", onAbort);
  }
}

export type ToolCallParts = { id: string; name: string; arguments: string };

export type ChatStream = {
  content: string;
  reasoning: string;
  finishReason: FinishReason;
  toolCallsByIndex: Map<number, ToolCallParts>;
  usage?: Usage;
  timings?: Timings;
};

export function chatHeaders(apiKey: string | undefined): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

export async function readChatStream(
  response: Response,
  endpoint: string,
  onDelta?: (text: string) => void
): Promise<ChatStream> {
  if (!response.body) throw new Error(`empty response body from ${endpoint}`);

  const stream: ChatStream = {
    content: "",
    reasoning: "",
    finishReason: "stop",
    toolCallsByIndex: new Map(),
  };
  const decoder = new TextDecoder();
  let buffer = "";
  let rawBody = "";
  let sawSseLine = false;
  let streamError: string | undefined;

  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    sawSseLine = true;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;

    const evt = parseStreamChunk(data);
    if (!evt) return;

    if (evt.error?.message) streamError = evt.error.message;
    stream.usage = evt.usage ?? stream.usage;
    stream.timings = evt.timings ?? stream.timings;

    const choice = evt.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) stream.finishReason = narrowFinishReason(choice.finish_reason);

    const delta = choice.delta;
    if (typeof delta.content === "string" && delta.content.length) {
      stream.content += delta.content;
      onDelta?.(delta.content);
    }
    if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length) {
      stream.reasoning += delta.reasoning_content;
    }

    for (const tc of delta.tool_calls ?? []) {
      const current = stream.toolCallsByIndex.get(tc.index) ?? {
        id: "",
        name: "",
        arguments: "",
      };
      if (typeof tc.id === "string") current.id = tc.id;
      if (tc.function?.name) current.name = tc.function.name;
      if (typeof tc.function?.arguments === "string") current.arguments += tc.function.arguments;
      stream.toolCallsByIndex.set(tc.index, current);
    }
  };

  for await (const chunk of response.body) {
    const text = decoder.decode(chunk, { stream: true });
    rawBody += text;
    buffer += text;
    for (let nl = buffer.indexOf("\n"); nl !== -1; nl = buffer.indexOf("\n")) {
      consume(buffer.slice(0, nl).trimEnd());
      buffer = buffer.slice(nl + 1);
    }
  }
  if (buffer.trim()) consume(buffer.trimEnd());

  if (streamError) throw new Error(streamError);
  if (!sawSseLine) throw nonSseError(endpoint, rawBody);
  return stream;
}

export function parseStreamChunk(
  data: string
): Schema.Schema.Type<typeof ChatStreamChunkSchema> | undefined {
  try {
    const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(JSON.parse(data));
    if (Either.isRight(result)) return result.right;
    console.error("[stream] chunk decode error:", result.left.message);
  } catch {}
  return undefined;
}

export function nonSseError(endpoint: string, body: string): Error {
  const trimmed = body.trim();
  if (!trimmed) return new Error(`empty response body from ${endpoint}`);

  try {
    const parsed = JSON.parse(trimmed) as { error?: { message?: unknown }; message?: unknown };
    const message = parsed.error?.message ?? parsed.message ?? trimmed;
    return new Error(`non-SSE response from ${endpoint}: ${String(message).slice(0, 500)}`);
  } catch {
    return new Error(`non-SSE response from ${endpoint}: ${trimmed.slice(0, 500)}`);
  }
}

export function buildToolCalls(toolCallsByIndex: Map<number, ToolCallParts>): OpenAIToolCall[] {
  return [...toolCallsByIndex.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments || "{}" },
    }));
}

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith("/v1/chat/completions")
    ? endpoint
    : `${endpoint.replace(/\/+$/, "")}/v1/chat/completions`;
}

export function narrowFinishReason(value: string): FinishReason {
  if (value === "stop") return "stop";
  if (value === "tool_calls" || value === "function_call") return "tool_calls";
  if (value === "length" || value === "content_filter") return value;
  throw new Error(`unsupported finish_reason: ${value}`);
}

export function extractModelCallMetrics(
  response: ModelMetricSource,
  requestTimeMs: number
): ModelCallMetrics {
  const promptEvalTokens = response.timings?.prompt_n ?? response.prompt_eval_count;
  const completionEvalTokens = response.timings?.predicted_n ?? response.eval_count;
  const promptTokens = response.usage?.prompt_tokens ?? promptEvalTokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? completionEvalTokens ?? 0;
  const totalTokens = response.usage?.total_tokens ?? promptTokens + completionTokens;
  const promptEvalTimeMs =
    response.timings?.prompt_ms ?? nsDurationToMs(response.prompt_eval_duration);
  const completionEvalTimeMs =
    response.timings?.predicted_ms ?? nsDurationToMs(response.eval_duration);

  return {
    promptTokens: promptTokens as TokenCount,
    completionTokens: completionTokens as TokenCount,
    totalTokens: totalTokens as TokenCount,
    totalRequestTimeMs: requestTimeMs as Ms,
    ...(promptEvalTimeMs !== undefined && promptEvalTokens !== undefined
      ? {
          promptEvalTokens: promptEvalTokens as TokenCount,
          promptEvalTimeMs: promptEvalTimeMs as Ms,
        }
      : {}),
    ...(completionEvalTimeMs !== undefined && completionEvalTokens !== undefined
      ? {
          completionEvalTokens: completionEvalTokens as TokenCount,
          completionEvalTimeMs: completionEvalTimeMs as Ms,
        }
      : {}),
  };
}

export function nsDurationToMs(value: number | undefined): Ms | undefined {
  return value === undefined ? undefined : nsToMs(value as Ns);
}

function isTransientModelError(error: unknown, endpoint: string): boolean {
  const message = errorMessage(error);
  if (/^TIMEOUT$/i.test(message)) return false;

  const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const endpointPattern = new RegExp(escapedEndpoint, "i");

  if (/empty response body from /i.test(message) && endpointPattern.test(message)) return true;
  if (/non-SSE response from /i.test(message) && endpointPattern.test(message)) return true;

  return /fetch failed|econnreset|econnrefused|socket hang up|connection reset|connection refused/i.test(
    message
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.round(ms))));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
