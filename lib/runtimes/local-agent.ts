import { Either, Schema } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readEnv } from "../config/env.ts";
import type { Ms, TokenCount, ToolResult } from "../schemas/index.js";
import { PropsSchema } from "../schemas/index.js";
import type { ModelMetrics, RuntimeOutput, ToolCall } from "../scoring.ts";
import type { Runtime, RuntimeContext, RuntimeSession, RuntimeSessionContext } from "./types.ts";
import type { ChatMessage, ModelCallMetrics, OpenAIToolCall } from "./local-model.ts";
import { callModel, normalizeEndpoint } from "./local-model.ts";
import type { PendingToolExecution } from "./local-tools.ts";
import { DEFAULT_TOOL_EXECUTION_MODE, executeToolBatch, openAiTools } from "./local-tools.ts";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const SYSTEM_PROMPT_PATH = join(PROJECT_ROOT, "system-prompt.md");
const MAX_TOOL_ITERATIONS = 20;

const systemPrompt = readSystemPrompt();
if (!systemPrompt) {
  throw new Error(`Missing system prompt at ${SYSTEM_PROMPT_PATH}. This file is required.`);
}
const ACTIVE_SYSTEM_PROMPT = systemPrompt;

type RunState = {
  conversation: ChatMessage[];
  transcript: string[];
  toolCalls: ToolCall[];
  modelMetrics: ModelMetrics;
  startedAt: number;
  firstTokenMs: Ms | undefined;
};

type LocalEvent =
  | { type: "assistant_delta"; content: string }
  | { type: "assistant"; message: ChatMessage }
  | { type: "tool_call"; call: OpenAIToolCall; toolCall: ToolCall }
  | { type: "tool_result"; call: OpenAIToolCall; toolCall: ToolCall; result: ToolResult }
  | { type: "model_metrics"; metrics: ModelCallMetrics };

function createRunState(systemPrompt: string, model: string): RunState {
  return {
    conversation: [{ role: "system", content: systemPrompt }],
    transcript: [],
    toolCalls: [],
    modelMetrics: createModelMetrics(model),
    startedAt: performance.now(),
    firstTokenMs: undefined,
  };
}

function applyLocalEvent(event: LocalEvent, state: RunState, ctx: RuntimeSessionContext): void {
  switch (event.type) {
    case "assistant_delta": {
      if (state.firstTokenMs === undefined && event.content.trim().length > 0) {
        state.firstTokenMs = Math.round(performance.now() - state.startedAt) as Ms;
      }
      ctx.onEvent?.({ type: "assistant_delta", content: event.content });
      return;
    }
    case "assistant": {
      state.conversation.push(event.message);
      if (event.message.content) {
        state.transcript.push(`assistant: ${event.message.content}`);
        ctx.onEvent?.({ type: "assistant", content: event.message.content });
      }
      return;
    }
    case "tool_call": {
      const args = event.call.function.arguments ?? "{}";
      state.transcript.push(`tool: ${event.call.function.name}(${args})`);
      state.toolCalls.push(event.toolCall);
      ctx.onEvent?.({ type: "tool_call", call: event.toolCall });
      return;
    }
    case "tool_result": {
      event.toolCall.result = event.result;
      const resultText = event.result.ok ? event.result.value : `error: ${event.result.message}`;
      ctx.onEvent?.({ type: "tool_result", call: event.toolCall, result: resultText });
      state.conversation.push({
        role: "tool",
        tool_call_id: event.call.id,
        content: resultText,
      });
      return;
    }
    case "model_metrics": {
      applyModelCallMetrics(state.modelMetrics, event.metrics);
      ctx.onEvent?.({ type: "model_metrics", metrics: { ...state.modelMetrics } });
      return;
    }
    default: {
      const _exhaustive: never = event;
      throw new Error(`unhandled event type: ${(_exhaustive as LocalEvent).type}`);
    }
  }
}

function finishRun(state: RunState, error?: string): RuntimeOutput {
  return finishRuntime(
    state.transcript,
    state.toolCalls,
    state.startedAt,
    error,
    state.modelMetrics,
    state.firstTokenMs
  );
}

export const localRuntime: Runtime = {
  name: "local",

  async run(ctx: RuntimeContext): Promise<RuntimeOutput> {
    const session = await createLocalSession(ctx);
    try {
      return await session.runTurn(ctx.prompt, ctx.timeoutMs);
    } finally {
      await session.close?.();
    }
  },

  async startSession(ctx: RuntimeSessionContext): Promise<RuntimeSession> {
    return createLocalSession(ctx);
  },

  async getContextWindow(ctx?: RuntimeSessionContext): Promise<number | undefined> {
    const endpoint = normalizeEndpoint(ctx?.endpoint ?? readEnv().localEndpoint);
    const model = ctx?.model;
    if (!model) return undefined;
    const base = endpoint.replace(/\/v1\/chat\/completions$/, "");
    const probeUrl = `${base}/upstream/${encodeURIComponent(model)}/props`;
    const extract = (data: unknown): number | undefined => {
      const result = Schema.decodeUnknownEither(PropsSchema)(data);
      if (Either.isLeft(result)) return undefined;
      const props = result.right;
      const fromSettings = props.default_generation_settings?.n_ctx;
      if (typeof fromSettings === "number" && Number.isFinite(fromSettings)) return fromSettings;
      const top = props.n_ctx;
      return typeof top === "number" && Number.isFinite(top) ? top : undefined;
    };
    const probe = async (): Promise<Response | undefined> => {
      try {
        return await fetch(probeUrl, { signal: AbortSignal.timeout(5_000) });
      } catch {
        return undefined;
      }
    };
    try {
      let res = await probe();
      if (!res || res.status === 404) {
        await warmupModel(endpoint, model, ctx?.apiKey);
        res = await probe();
      }
      if (!res || !res.ok) return undefined;
      return extract(await res.json());
    } catch {
      return undefined;
    }
  },
};

async function createLocalSession(ctx: RuntimeSessionContext): Promise<RuntimeSession> {
  const env = readEnv();
  const effectiveEndpoint = normalizeEndpoint(ctx.endpoint ?? env.localEndpoint);
  const effectiveModel = ctx.model;
  if (!effectiveModel) {
    throw new Error("No model specified. Pass `model` in the runtime context.");
  }
  const effectiveApiKey = ctx.apiKey;
  const effectiveSystemPrompt = ctx.systemPrompt ?? ACTIVE_SYSTEM_PROMPT;
  const signal = ctx.signal;

  const state = createRunState(effectiveSystemPrompt, effectiveModel);

  return {
    async runTurn(prompt: string, timeoutMs: number): Promise<RuntimeOutput> {
      state.startedAt = performance.now();
      const deadline = state.startedAt + timeoutMs;

      state.conversation.push({ role: "user", content: prompt });

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        if (performance.now() >= deadline) return finishRun(state, "TIMEOUT");
        if (signal?.aborted) return finishRun(state, "ABORTED");

        let reply;
        try {
          reply = await callModel(
            state.conversation,
            deadline,
            { endpoint: effectiveEndpoint, model: effectiveModel, apiKey: effectiveApiKey, signal },
            openAiTools,
            (delta) => applyLocalEvent({ type: "assistant_delta", content: delta }, state, ctx)
          );
        } catch (error) {
          const msg = errorMessage(error);
          return finishRun(state, msg === "TIMEOUT" ? "TIMEOUT" : `CRASH: ${msg}`);
        }

        applyLocalEvent({ type: "model_metrics", metrics: reply.metrics }, state, ctx);

        if (!reply.message) return finishRun(state, "CRASH: missing assistant message");

        applyLocalEvent({ type: "assistant", message: reply.message }, state, ctx);

        if (reply.finishReason !== "tool_calls" || !reply.message.tool_calls?.length) {
          return finishRun(state);
        }

        const pendingCalls: PendingToolExecution[] = reply.message.tool_calls.map((call) => {
          const toolCall: ToolCall = {
            name: call.function.name,
            args: call.function.arguments ?? "{}",
            turn: state.toolCalls.length,
          };
          applyLocalEvent({ type: "tool_call", call, toolCall }, state, ctx);
          return { call, toolCall };
        });

        const results = await executeToolBatch(pendingCalls, ctx.workDir, {
          toolExecution: ctx.toolExecution ?? DEFAULT_TOOL_EXECUTION_MODE,
          beforeToolCall: ctx.beforeToolCall,
          afterToolCall: ctx.afterToolCall,
          signal,
        });

        for (let i = 0; i < pendingCalls.length; i++) {
          applyLocalEvent(
            {
              type: "tool_result",
              call: pendingCalls[i].call,
              toolCall: pendingCalls[i].toolCall,
              result: results[i],
            },
            state,
            ctx
          );
        }
      }

      state.transcript.push(`guard: hit ${MAX_TOOL_ITERATIONS} tool iterations, stopping`);
      return finishRun(state);
    },
  };
}

function finishRuntime(
  stdoutLines: string[],
  toolCalls: ToolCall[],
  startedAt: number,
  error: string | undefined,
  modelMetrics: ModelMetrics,
  firstTokenMs?: Ms
): RuntimeOutput {
  return {
    stdout: stdoutLines.join("\n"),
    toolCalls: toolCalls.map((call) => ({ ...call })),
    wallTimeMs: Math.round(performance.now() - startedAt) as Ms,
    ...(firstTokenMs !== undefined ? { firstTokenMs } : {}),
    modelMetrics: { ...modelMetrics },
    ...(error ? { error } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readSystemPrompt(): string | undefined {
  if (!existsSync(SYSTEM_PROMPT_PATH)) return undefined;
  return readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
}

async function warmupModel(endpoint: string, model: string, apiKey?: string): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "." }],
      max_tokens: 1,
      stream: false,
    }),
    signal: AbortSignal.timeout(180_000),
  }).catch(() => undefined);
}

function createModelMetrics(model: string): ModelMetrics {
  return {
    model,
    requestCount: 0,
    promptTokens: 0 as TokenCount,
    completionTokens: 0 as TokenCount,
    totalTokens: 0 as TokenCount,
    totalRequestTimeMs: 0 as Ms,
  };
}

function applyModelCallMetrics(target: ModelMetrics, metrics: ModelCallMetrics): void {
  target.requestCount += 1;
  target.promptTokens = (target.promptTokens + metrics.promptTokens) as TokenCount;
  target.completionTokens = (target.completionTokens + metrics.completionTokens) as TokenCount;
  target.totalTokens = (target.totalTokens + metrics.totalTokens) as TokenCount;
  target.totalRequestTimeMs = (target.totalRequestTimeMs + metrics.totalRequestTimeMs) as Ms;

  if (metrics.promptEvalTokens !== undefined && metrics.promptEvalTimeMs !== undefined) {
    target.promptEvalTokens = ((target.promptEvalTokens ?? 0) +
      metrics.promptEvalTokens) as TokenCount;
    target.promptEvalTimeMs = ((target.promptEvalTimeMs ?? 0) + metrics.promptEvalTimeMs) as Ms;
  }

  if (metrics.completionEvalTokens !== undefined && metrics.completionEvalTimeMs !== undefined) {
    target.completionEvalTokens = ((target.completionEvalTokens ?? 0) +
      metrics.completionEvalTokens) as TokenCount;
    target.completionEvalTimeMs = ((target.completionEvalTimeMs ?? 0) +
      metrics.completionEvalTimeMs) as Ms;
  }
}
