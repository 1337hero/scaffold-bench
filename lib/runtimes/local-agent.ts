import { spawn } from "bun";
import { Either, Schema } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  BashArgs,
  EditArgs,
  LsArgs,
  Ms,
  Ns,
  ReadArgs,
  SafeRelativePath,
  TokenCount,
  ToolResult,
  WriteArgs,
} from "../schemas/index.js";
import {
  BashArgsSchema,
  ChatStreamChunkSchema,
  EditArgsSchema,
  EnvSchema,
  LsArgsSchema,
  PropsSchema,
  ReadArgsSchema,
  RootConfigSchema,
  WriteArgsSchema,
  err,
  nsToMs,
  ok,
  toJsonSchema,
} from "../schemas/index.js";
import type { ModelMetrics, RuntimeOutput, ToolCall } from "../scoring.ts";
import type {
  BeforeToolCallInput,
  Runtime,
  RuntimeContext,
  RuntimeSession,
  RuntimeSessionContext,
} from "./types.ts";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const ROOT_CONFIG_PATH = join(PROJECT_ROOT, "scaffold.config.json");
const SYSTEM_PROMPT_PATH = join(PROJECT_ROOT, "system-prompt.md");
const rootConfig = readRootConfig();
const env = Schema.decodeUnknownSync(EnvSchema)({
  SCAFFOLD_ENDPOINT: Bun.env.SCAFFOLD_ENDPOINT,
  SCAFFOLD_MODEL: Bun.env.SCAFFOLD_MODEL,
  SCAFFOLD_API_KEY: Bun.env.SCAFFOLD_API_KEY,
});
const DEFAULT_ENDPOINT = normalizeEndpoint(
  env.SCAFFOLD_ENDPOINT ?? rootConfig.endpoint ?? "http://127.0.0.1:8082"
);
const DEFAULT_MODEL = env.SCAFFOLD_MODEL ?? rootConfig.model;
if (!DEFAULT_MODEL) {
  throw new Error(
    "No model configured. Set SCAFFOLD_MODEL env var or add a `model` entry to scaffold.config.json."
  );
}
const ACTIVE_MODEL = DEFAULT_MODEL;
const API_KEY = env.SCAFFOLD_API_KEY;
const MAX_TOOL_ITERATIONS = 20;
const OUTPUT_CAP = 8192;
const DEFAULT_BASH_TIMEOUT_MS = 5000;
const MAX_BASH_TIMEOUT_MS = 10000;
const DEFAULT_TOOL_EXECUTION_MODE: RuntimeSessionContext["toolExecution"] = "sequential";
const MAX_PARALLEL_SAFE_TOOL_CALLS = 8;
const MAX_PARALLEL_BASH_CALLS = 2;

const systemPrompt = readSystemPrompt();
if (!systemPrompt) {
  throw new Error(
    `Missing system prompt at ${SYSTEM_PROMPT_PATH}. This file is required.`
  );
}
const ACTIVE_SYSTEM_PROMPT = systemPrompt;

type FinishReason = "tool_calls" | "stop" | "length" | "content_filter";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type PendingToolExecution = {
  call: OpenAIToolCall;
  toolCall: ToolCall;
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type Timings = {
  prompt_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_ms?: number;
};

type ModelMetricSource = {
  usage?: Usage;
  timings?: Timings;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

type ToolHandler = {
  description: string;
  parameters: object;
  run: (args: unknown, cwd: string, signal?: AbortSignal) => Promise<string>;
};

const toolHandlers: Record<string, ToolHandler> = {
  read: {
    description:
      "Read the contents of a file at the given relative path. Returns file contents as a string.",
    parameters: toJsonSchema(ReadArgsSchema),
    run: (args, cwd) => runRead(Schema.decodeUnknownSync(ReadArgsSchema)(args), cwd),
  },
  ls: {
    description:
      "List files and directories at the given path. If no path is provided, lists the current directory. Directories are marked with a trailing slash.",
    parameters: toJsonSchema(LsArgsSchema),
    run: (args, cwd) => runLs(Schema.decodeUnknownSync(LsArgsSchema)(args), cwd),
  },
  edit: {
    description: `Edit a file by replacing old_str with new_str.

Rules:
- old_str must match EXACTLY once in the file (including whitespace). If it appears zero or multiple times, the edit fails.
- If the file does not exist AND old_str is empty, the file is created with new_str as its contents.
- old_str and new_str must differ.`,
    parameters: toJsonSchema(EditArgsSchema),
    run: (args, cwd) => runEdit(Schema.decodeUnknownSync(EditArgsSchema)(args), cwd),
  },
  write: {
    description:
      "Write a complete file at the given relative path. Creates parent directories if needed and overwrites existing contents.",
    parameters: toJsonSchema(WriteArgsSchema),
    run: (args, cwd) => runWrite(Schema.decodeUnknownSync(WriteArgsSchema)(args), cwd),
  },
  bash: {
    description:
      "Run a shell command with cwd set to the scenario working directory. Prefer this for fast codebase search and verification; prefer one focused search command over multiple tool calls (examples: `ugrep -n \"pattern\" .`, `bfs . -type f`, `rg -n \"pattern\" .`, `find . -type f`).",
    parameters: toJsonSchema(BashArgsSchema),
    run: (args, cwd, signal) =>
      runBash(Schema.decodeUnknownSync(BashArgsSchema)(args), cwd, signal),
  },
};

const openAiTools = Object.entries(toolHandlers).map(([name, tool]) => ({
  type: "function",
  function: {
    name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

async function runRead(args: ReadArgs, cwd: string): Promise<string> {
  const filePath = resolveToolPath(cwd, args.path);
  return readFile(filePath, "utf-8");
}

async function runLs(args: LsArgs, cwd: string): Promise<string> {
  const dirPath = resolveToolPath(cwd, args.path ?? ".");
  const entries = await readdir(dirPath, { withFileTypes: true });
  return JSON.stringify(
    entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  );
}

async function runEdit(args: EditArgs, cwd: string): Promise<string> {
  const { path, old_str: oldStr, new_str: newStr } = args;
  if (oldStr === newStr) throw new Error("old_str and new_str are identical");

  const filePath = resolveToolPath(cwd, path);
  if (!existsSync(filePath)) {
    if (oldStr !== "") throw new Error(`file not found: ${path}`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, newStr, "utf-8");
    return `created ${path}`;
  }

  const content = await readFile(filePath, "utf-8");
  const matches = content.split(oldStr).length - 1;
  if (matches === 0) throw new Error(`old_str not found in ${path}`);
  if (matches > 1)
    throw new Error(`old_str appears ${matches} times in ${path}; must be unique`);

  await writeFile(filePath, content.replace(oldStr, newStr), "utf-8");
  return "ok";
}

async function runWrite(args: WriteArgs, cwd: string): Promise<string> {
  const { path, content } = args;
  const filePath = resolveToolPath(cwd, path);
  const existed = existsSync(filePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
  return existed ? `updated ${path}` : `created ${path}`;
}

async function runBash(args: BashArgs, cwd: string, signal?: AbortSignal): Promise<string> {
  const { command } = args;
  const timeoutMs = Math.min(
    MAX_BASH_TIMEOUT_MS,
    Math.max(1, Math.floor(args.timeout_ms ?? DEFAULT_BASH_TIMEOUT_MS))
  );
  const proc = spawn({
    cmd: ["setsid", process.env.SHELL || "/bin/zsh", "-lc", command],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessGroup(proc);
  }, timeoutMs);

  const onAbort = () => killProcessGroup(proc);
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    streamToString(proc.stdout),
    streamToString(proc.stderr),
    proc.exited,
  ]);

  clearTimeout(timer);
  signal?.removeEventListener("abort", onAbort);

  const sections = [`exit_code: ${timedOut ? 124 : exitCode}`];
  if (stdout.trim()) {
    sections.push(`stdout:\n${truncate(stdout)}`);
  }
  if (stderr.trim() || timedOut) {
    const stderrText = timedOut
      ? `${stderr}${stderr && !stderr.endsWith("\n") ? "\n" : ""}timed out after ${timeoutMs}ms`
      : stderr;
    sections.push(`stderr:\n${truncate(stderrText)}`);
  }
  if (sections.length === 1) {
    sections.push("stdout:\n<empty>");
  }

  return sections.join("\n\n");
}

type ModelCallMetrics = {
  promptTokens: TokenCount;
  completionTokens: TokenCount;
  totalTokens: TokenCount;
  totalRequestTimeMs: Ms;
  promptEvalTokens?: TokenCount;
  promptEvalTimeMs?: Ms;
  completionEvalTokens?: TokenCount;
  completionEvalTimeMs?: Ms;
};

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

  async getContextWindow(): Promise<number | undefined> {
    const base = DEFAULT_ENDPOINT.replace(/\/v1\/chat\/completions$/, "");
    const probeUrl = `${base}/upstream/${encodeURIComponent(ACTIVE_MODEL)}/props`;
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
        await warmupModel();
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
  const effectiveEndpoint = ctx.endpoint ? normalizeEndpoint(ctx.endpoint) : DEFAULT_ENDPOINT;
  const effectiveModel = ctx.model ?? ACTIVE_MODEL;
  const effectiveApiKey = ctx.apiKey ?? API_KEY;
  const effectiveSystemPrompt = ctx.systemPrompt ?? ACTIVE_SYSTEM_PROMPT;
  const signal = ctx.signal;

  const conversation: ChatMessage[] = [{ role: "system", content: effectiveSystemPrompt }];
  const transcript: string[] = [];
  const toolCalls: ToolCall[] = [];
  const modelMetrics = createModelMetrics(effectiveModel);

  return {
    async runTurn(prompt: string, timeoutMs: number): Promise<RuntimeOutput> {
      const startedAt = performance.now();
      const deadline = startedAt + timeoutMs;
      let firstTokenMs: Ms | undefined;
      const finish = (error?: string) =>
        finishRuntime(transcript, toolCalls, startedAt, error, modelMetrics, firstTokenMs);

      conversation.push({ role: "user", content: prompt });

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        if (performance.now() >= deadline) return finish("TIMEOUT");
        if (signal?.aborted) return finish("ABORTED");

        let reply;
        try {
          reply = await callModel(
            conversation,
            deadline,
            {
              endpoint: effectiveEndpoint,
              model: effectiveModel,
              apiKey: effectiveApiKey,
              signal,
            },
            (delta) => {
              if (firstTokenMs === undefined && delta.trim().length > 0) {
                firstTokenMs = Math.round(performance.now() - startedAt) as Ms;
              }
              ctx.onEvent?.({ type: "assistant_delta", content: delta });
            }
          );
        } catch (error) {
          const msg = errorMessage(error);
          const errorTag = msg === "TIMEOUT" ? "TIMEOUT" : `CRASH: ${msg}`;
          return finish(errorTag);
        }
        applyModelCallMetrics(modelMetrics, reply.metrics);
        ctx.onEvent?.({ type: "model_metrics", metrics: { ...modelMetrics } });
        const message = reply.message;
        if (!message) {
          return finish("CRASH: missing assistant message");
        }

        conversation.push(message);

        if (message.content) {
          transcript.push(`assistant: ${message.content}`);
          ctx.onEvent?.({ type: "assistant", content: message.content });
        }

        if (reply.finishReason !== "tool_calls" || !message.tool_calls?.length) {
          return finish();
        }

        const pendingCalls: PendingToolExecution[] = message.tool_calls.map((call) => {
          const args = call.function.arguments ?? "{}";
          transcript.push(`tool: ${call.function.name}(${args})`);
          const toolCall: ToolCall = {
            name: call.function.name,
            args,
            turn: toolCalls.length,
          };
          toolCalls.push(toolCall);
          ctx.onEvent?.({ type: "tool_call", call: toolCall });
          return { call, toolCall };
        });

        const results = await executeToolBatch(pendingCalls, ctx.workDir, {
          toolExecution: ctx.toolExecution ?? DEFAULT_TOOL_EXECUTION_MODE,
          beforeToolCall: ctx.beforeToolCall,
          afterToolCall: ctx.afterToolCall,
          signal,
        });

        for (let i = 0; i < pendingCalls.length; i++) {
          const pending = pendingCalls[i];
          const result = results[i];
          pending.toolCall.result = result;
          const resultText = result.ok ? result.value : `error: ${result.message}`;
          ctx.onEvent?.({ type: "tool_result", call: pending.toolCall, result: resultText });
          conversation.push({
            role: "tool",
            tool_call_id: pending.call.id,
            content: resultText,
          });
        }
      }

      transcript.push(`guard: hit ${MAX_TOOL_ITERATIONS} tool iterations, stopping`);
      return finish();
    },
  };
}

type CallModelConfig = {
  endpoint: string;
  model: string;
  apiKey: string | undefined;
  signal?: AbortSignal;
};

async function callModel(
  conversation: ChatMessage[],
  deadline: number,
  config: CallModelConfig,
  onDelta?: (text: string) => void
): Promise<{ finishReason: FinishReason; message?: ChatMessage; metrics: ModelCallMetrics }> {
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
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: chatHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: conversation,
        stream: true,
        stream_options: { include_usage: true },
        tools: openAiTools,
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
      metrics: extractModelCallMetrics(
        { usage: stream.usage, timings: stream.timings },
        performance.now() - requestStartedAt
      ),
    };
  } catch (error) {
    if (timedOut || /timed out/i.test(errorMessage(error))) throw new Error("TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
    config.signal?.removeEventListener("abort", onAbort);
  }
}

type ToolCallParts = { id: string; name: string; arguments: string };

type ChatStream = {
  content: string;
  finishReason: FinishReason;
  toolCallsByIndex: Map<number, ToolCallParts>;
  usage?: Usage;
  timings?: Timings;
};

function chatHeaders(apiKey: string | undefined): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function readChatStream(
  response: Response,
  endpoint: string,
  onDelta?: (text: string) => void
): Promise<ChatStream> {
  if (!response.body) throw new Error(`empty response body from ${endpoint}`);

  const stream: ChatStream = {
    content: "",
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

function parseStreamChunk(data: string): Schema.Schema.Type<typeof ChatStreamChunkSchema> | undefined {
  try {
    const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(JSON.parse(data));
    if (Either.isRight(result)) return result.right;
    console.error("[stream] chunk decode error:", result.left.message);
  } catch {}
  return undefined;
}

function nonSseError(endpoint: string, body: string): Error {
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

function buildToolCalls(toolCallsByIndex: Map<number, ToolCallParts>): OpenAIToolCall[] {
  return [...toolCallsByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      type: "function",
      function: { name: tc.name, arguments: tc.arguments || "{}" },
    }));
}

type ToolExecutionHooks = Pick<
  RuntimeSessionContext,
  "toolExecution" | "beforeToolCall" | "afterToolCall"
> & {
  signal?: AbortSignal;
};

async function executeToolBatch(
  pendingCalls: PendingToolExecution[],
  cwd: string,
  hooks?: ToolExecutionHooks
): Promise<ToolResult[]> {
  const mode = hooks?.toolExecution ?? DEFAULT_TOOL_EXECUTION_MODE;
  if (mode !== "parallel") {
    const results: ToolResult[] = [];
    for (const pending of pendingCalls) {
      results.push(await executeTool(pending.call, cwd, hooks));
    }
    return results;
  }

  const results: ToolResult[] = new Array(pendingCalls.length);
  for (let i = 0; i < pendingCalls.length; ) {
    if (!isParallelSafeTool(pendingCalls[i].call.function.name)) {
      results[i] = await executeTool(pendingCalls[i].call, cwd, hooks);
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < pendingCalls.length && isParallelSafeTool(pendingCalls[end].call.function.name)) {
      end += 1;
    }

    const segment = pendingCalls.slice(i, end);
    const segmentResults = await executeSafeBatchParallel(segment, cwd, hooks);
    for (let segIdx = 0; segIdx < segmentResults.length; segIdx++) {
      results[i + segIdx] = segmentResults[segIdx];
    }
    i = end;
  }

  return results;
}

function isParallelSafeTool(name: string): boolean {
  return name === "read" || name === "ls" || name === "bash";
}

function isBashTool(pending: PendingToolExecution): boolean {
  return pending.call.function.name === "bash";
}

async function executeSafeBatchParallel(
  batch: PendingToolExecution[],
  cwd: string,
  hooks?: ToolExecutionHooks
): Promise<ToolResult[]> {
  const results: ToolResult[] = new Array(batch.length);
  let nextIndex = 0;
  let active = 0;
  let activeBash = 0;

  await new Promise<void>((resolve) => {
    const launch = () => {
      while (nextIndex < batch.length && active < MAX_PARALLEL_SAFE_TOOL_CALLS) {
        const index = nextIndex;
        const pending = batch[index];
        if (isBashTool(pending) && activeBash >= MAX_PARALLEL_BASH_CALLS) break;

        nextIndex += 1;
        active += 1;
        if (isBashTool(pending)) activeBash += 1;

        void executeTool(pending.call, cwd, hooks)
          .then((result) => {
            results[index] = result;
          })
          .catch((error) => {
            results[index] = err(errorMessage(error));
          })
          .finally(() => {
            active -= 1;
            if (isBashTool(pending)) activeBash -= 1;
            if (nextIndex >= batch.length && active === 0) {
              resolve();
              return;
            }
            launch();
          });
      }
    };

    if (batch.length === 0) {
      resolve();
      return;
    }
    launch();
  });

  return results;
}

async function executeTool(
  call: OpenAIToolCall,
  cwd: string,
  hooks?: ToolExecutionHooks
): Promise<ToolResult> {
  const rawArgs = call.function.arguments ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch (error) {
    return err(`invalid tool arguments JSON: ${errorMessage(error)}`);
  }

  const beforeInput: BeforeToolCallInput = {
    id: call.id,
    name: call.function.name,
    rawArgs,
    parsedArgs: parsed,
    workDir: cwd,
  };

  try {
    const before = await hooks?.beforeToolCall?.(beforeInput);
    if (before?.block) {
      return err(before.reason ?? `tool execution blocked: ${call.function.name}`);
    }
  } catch (error) {
    return err(errorMessage(error));
  }

  const tool = toolHandlers[call.function.name];
  let result: ToolResult;
  try {
    result = tool
      ? ok(await tool.run(parsed, cwd, hooks?.signal))
      : err(`unknown tool "${call.function.name}"`);
  } catch (error) {
    result = err(errorMessage(error));
  }

  try {
    const overridden = await hooks?.afterToolCall?.({ ...beforeInput, result });
    return overridden ?? result;
  } catch (error) {
    return err(errorMessage(error));
  }
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

function resolveToolPath(cwd: string, relativePath: string): SafeRelativePath {
  if (relativePath.trim() === "") {
    throw new Error("path is required");
  }
  if (isAbsolute(relativePath)) {
    throw new Error("absolute paths are not allowed");
  }
  const resolvedPath = resolve(cwd, relativePath);
  const relativePathFromCwd = relative(cwd, resolvedPath);
  if (
    relativePathFromCwd === ".." ||
    relativePathFromCwd.startsWith(`..${sep}`) ||
    isAbsolute(relativePathFromCwd)
  ) {
    throw new Error(`path escapes working directory: ${relativePath}`);
  }
  return resolvedPath as SafeRelativePath;
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function truncate(value: string): string {
  return value.length > OUTPUT_CAP ? `${value.slice(0, OUTPUT_CAP)}\n... [truncated]` : value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readRootConfig(): { endpoint?: string; model?: string } {
  if (!existsSync(ROOT_CONFIG_PATH)) return {};

  const raw = readFileSync(ROOT_CONFIG_PATH, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid root config JSON: ${errorMessage(error)}`);
  }
  return Schema.decodeUnknownSync(RootConfigSchema)(parsed);
}

function readSystemPrompt(): string | undefined {
  if (!existsSync(SYSTEM_PROMPT_PATH)) return undefined;
  return readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
}

async function warmupModel(): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (API_KEY) headers.authorization = `Bearer ${API_KEY}`;
  await fetch(DEFAULT_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: ACTIVE_MODEL,
      messages: [{ role: "user", content: "." }],
      max_tokens: 1,
      stream: false,
    }),
    signal: AbortSignal.timeout(180_000),
  }).catch(() => undefined);
}

function killProcessGroup(proc: ReturnType<typeof spawn>): void {
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith("/v1/chat/completions")
    ? endpoint
    : `${endpoint.replace(/\/+$/, "")}/v1/chat/completions`;
}

function narrowFinishReason(value: string): FinishReason {
  if (value === "stop") return "stop";
  if (value === "tool_calls" || value === "function_call") return "tool_calls";
  if (value === "length" || value === "content_filter") return value;
  throw new Error(`unsupported finish_reason: ${value}`);
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
    target.promptEvalTokens = ((target.promptEvalTokens ?? 0) + metrics.promptEvalTokens) as TokenCount;
    target.promptEvalTimeMs = ((target.promptEvalTimeMs ?? 0) + metrics.promptEvalTimeMs) as Ms;
  }

  if (
    metrics.completionEvalTokens !== undefined &&
    metrics.completionEvalTimeMs !== undefined
  ) {
    target.completionEvalTokens =
      ((target.completionEvalTokens ?? 0) + metrics.completionEvalTokens) as TokenCount;
    target.completionEvalTimeMs =
      ((target.completionEvalTimeMs ?? 0) + metrics.completionEvalTimeMs) as Ms;
  }
}

function extractModelCallMetrics(
  response: ModelMetricSource,
  requestTimeMs: number
): ModelCallMetrics {
  const promptEvalTokens = response.timings?.prompt_n ?? response.prompt_eval_count;
  const completionEvalTokens = response.timings?.predicted_n ?? response.eval_count;
  const promptTokens = response.usage?.prompt_tokens ?? promptEvalTokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? completionEvalTokens ?? 0;
  const totalTokens =
    response.usage?.total_tokens ?? promptTokens + completionTokens;
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
    ...(completionEvalTimeMs !== undefined
      && completionEvalTokens !== undefined
      ? {
          completionEvalTokens: completionEvalTokens as TokenCount,
          completionEvalTimeMs: completionEvalTimeMs as Ms,
        }
      : {}),
  };
}

function nsDurationToMs(value: number | undefined): Ms | undefined {
  return value === undefined ? undefined : nsToMs(value as Ns);
}
