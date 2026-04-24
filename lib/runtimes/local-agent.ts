import { spawn } from "bun";
import { Either, Schema } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  BashArgsSchema,
  ChatStreamChunkSchema,
  EditArgsSchema,
  EnvSchema,
  GlobArgsSchema,
  GrepArgsSchema,
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
import type {
  BashArgs,
  EditArgs,
  GlobArgs,
  GrepArgs,
  LsArgs,
  Ms,
  Ns,
  ReadArgs,
  SafeRelativePath,
  TokenCount,
  ToolResult,
  WriteArgs,
} from "../schemas/index.js";
import type { ModelMetrics, RuntimeOutput, ToolCall } from "../scoring.ts";
import type { Runtime, RuntimeContext, RuntimeSession, RuntimeSessionContext } from "./types.ts";

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

const systemPrompt = readSystemPrompt();
if (!systemPrompt) {
  throw new Error(
    `Missing system prompt at ${SYSTEM_PROMPT_PATH}. This file is required.`
  );
}
const ACTIVE_SYSTEM_PROMPT = systemPrompt;

type JsonObject = Record<string, unknown>;
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

type ChatResponse = {
  choices?: Array<{
    finish_reason?: FinishReason;
    message?: ChatMessage;
  }>;
  error?: {
    message?: string;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  timings?: {
    prompt_n?: number;
    prompt_ms?: number;
    prompt_per_second?: number;
    predicted_n?: number;
    predicted_ms?: number;
    predicted_per_second?: number;
  };
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
};

type ToolDescriptor = {
  name: string;
  description: string;
  parameters: object;
};

const tools: ToolDescriptor[] = [
  {
    name: "read",
    description:
      "Read the contents of a file at the given relative path. Returns file contents as a string.",
    parameters: toJsonSchema(ReadArgsSchema),
  },
  {
    name: "ls",
    description:
      "List files and directories at the given path. If no path is provided, lists the current directory. Directories are marked with a trailing slash.",
    parameters: toJsonSchema(LsArgsSchema),
  },
  {
    name: "grep",
    description:
      "Search for a regex pattern across files using ripgrep. Returns matches as file:line:content. Use this to find where things are defined or referenced.",
    parameters: toJsonSchema(GrepArgsSchema),
  },
  {
    name: "glob",
    description:
      "Find files by glob pattern using ripgrep file listing. Returns matching file paths, one per line.",
    parameters: toJsonSchema(GlobArgsSchema),
  },
  {
    name: "edit",
    description: `Edit a file by replacing old_str with new_str.

Rules:
- old_str must match EXACTLY once in the file (including whitespace). If it appears zero or multiple times, the edit fails.
- If the file does not exist AND old_str is empty, the file is created with new_str as its contents.
- old_str and new_str must differ.`,
    parameters: toJsonSchema(EditArgsSchema),
  },
  {
    name: "write",
    description:
      "Write a complete file at the given relative path. Creates parent directories if needed and overwrites existing contents.",
    parameters: toJsonSchema(WriteArgsSchema),
  },
  {
    name: "bash",
    description:
      "Run a shell command with cwd set to the scenario working directory. Use this for tests, builds, linting, and command-line inspection.",
    parameters: toJsonSchema(BashArgsSchema),
  },
];

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

async function runGrep(args: GrepArgs, cwd: string): Promise<string> {
  const cmd = ["rg", "--line-number", "--no-heading", "--color=never"];
  if (args.ignore_case) cmd.push("-i");
  if (args.glob) cmd.push("--glob", args.glob);
  cmd.push("--", args.pattern);
  if (args.path) {
    cmd.push(resolveToolPath(cwd, args.path));
  }

  const proc = spawn({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    streamToString(proc.stdout),
    streamToString(proc.stderr),
    proc.exited,
  ]);

  if (exitCode === 1) return "no matches";
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `rg exited with code ${exitCode}`);
  }
  return truncate(stdout);
}

async function runGlob(args: GlobArgs, cwd: string): Promise<string> {
  const cmd = ["rg", "--files", "--glob", args.pattern];
  if (args.path) {
    cmd.push(resolveToolPath(cwd, args.path));
  }

  const proc = spawn({
    cmd,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    streamToString(proc.stdout),
    streamToString(proc.stderr),
    proc.exited,
  ]);

  if (exitCode === 1) return "no matches";
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `rg --files exited with code ${exitCode}`);
  }
  return truncate(stdout);
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

async function runBash(args: BashArgs, cwd: string): Promise<string> {
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
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill("SIGKILL");
    }
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    streamToString(proc.stdout),
    streamToString(proc.stderr),
    proc.exited,
  ]);

  clearTimeout(timer);

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

// Built-in local runtime for OpenAI-compatible chat-completions endpoints.
export const localRuntime: Runtime = {
  name: "local",

  async run(ctx: RuntimeContext): Promise<RuntimeOutput> {
    const session = await createLocalSession({
      workDir: ctx.workDir,
      onEvent: ctx.onEvent,
    });
    try {
      return await session.runTurn(ctx.prompt, ctx.timeoutMs);
    } finally {
      await session.close?.();
    }
  },

  async startSession(ctx: RuntimeSessionContext): Promise<RuntimeSession> {
    return createLocalSession(ctx);
  },

  // Queries llama-swap's /upstream/<model>/props endpoint for the currently
  // configured n_ctx. llama-swap only proxies /upstream/* once the model has
  // been loaded, so if the probe 404s we fire a minimal chat request to
  // trigger load, then retry. Returns undefined on any failure so callers
  // can treat it as "unknown" rather than crash.
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
        // Trigger model load via a 1-token completion, then retry.
        const warmupHeaders: Record<string, string> = { "content-type": "application/json" };
        if (API_KEY) warmupHeaders.authorization = `Bearer ${API_KEY}`;
        await fetch(DEFAULT_ENDPOINT, {
          method: "POST",
          headers: warmupHeaders,
          body: JSON.stringify({
            model: ACTIVE_MODEL,
            messages: [{ role: "user", content: "." }],
            max_tokens: 1,
            stream: false,
          }),
          signal: AbortSignal.timeout(180_000),
        }).catch(() => undefined);
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
  const conversation: ChatMessage[] = [{ role: "system", content: ACTIVE_SYSTEM_PROMPT }];
  const transcript: string[] = [];
  const toolCalls: ToolCall[] = [];
  const modelMetrics = createModelMetrics(ACTIVE_MODEL);

  return {
    async runTurn(prompt: string, timeoutMs: number): Promise<RuntimeOutput> {
      const startedAt = performance.now();
      const deadline = startedAt + timeoutMs;
      let firstTokenMs: Ms | undefined;

      conversation.push({ role: "user", content: prompt });

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        if (performance.now() >= deadline) {
          return finishRuntime(transcript, toolCalls, startedAt, "TIMEOUT", modelMetrics, {
            firstTokenMs,
          });
        }

        let reply;
        try {
          reply = await callModel(conversation, deadline, (delta) => {
            if (firstTokenMs === undefined && delta.trim().length > 0) {
              firstTokenMs = Math.round(performance.now() - startedAt) as Ms;
            }
            ctx.onEvent?.({ type: "assistant_delta", content: delta });
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const errorTag = msg === "TIMEOUT" ? "TIMEOUT" : `CRASH: ${msg}`;
          return finishRuntime(transcript, toolCalls, startedAt, errorTag, modelMetrics, {
            firstTokenMs,
          });
        }
        applyModelCallMetrics(modelMetrics, reply.metrics);
        ctx.onEvent?.({ type: "model_metrics", metrics: { ...modelMetrics } });
        const message = reply.message;
        if (!message) {
          return finishRuntime(
            transcript,
            toolCalls,
            startedAt,
            "CRASH: missing assistant message",
            modelMetrics,
            { firstTokenMs }
          );
        }

        conversation.push(message);

        if (message.content) {
          transcript.push(`assistant: ${message.content}`);
          ctx.onEvent?.({ type: "assistant", content: message.content });
        }

        if (reply.finishReason !== "tool_calls" || !message.tool_calls?.length) {
          return finishRuntime(transcript, toolCalls, startedAt, undefined, modelMetrics, {
            firstTokenMs,
          });
        }

        for (const call of message.tool_calls) {
          const args = call.function.arguments ?? "{}";
          transcript.push(`tool: ${call.function.name}(${args})`);
          const toolCall: ToolCall = {
            name: call.function.name,
            args,
            turn: toolCalls.length,
          };
          toolCalls.push(toolCall);
          ctx.onEvent?.({ type: "tool_call", call: toolCall });

          const result = await executeTool(call, ctx.workDir);
          toolCall.result = result;
          // The LLM-facing tool message is still a string; preserve the legacy
          // `error: <msg>` prefix so existing prompt patterns stay stable.
          const resultText = result.ok ? result.value : `error: ${result.message}`;
          ctx.onEvent?.({ type: "tool_result", call: toolCall, result: resultText });
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            content: resultText,
          });
        }
      }

      transcript.push(`guard: hit ${MAX_TOOL_ITERATIONS} tool iterations, stopping`);
      return finishRuntime(transcript, toolCalls, startedAt, undefined, modelMetrics, {
        firstTokenMs,
      });
    },
  };
}

async function callModel(
  conversation: ChatMessage[],
  deadline: number,
  onDelta?: (text: string) => void
): Promise<{ finishReason: FinishReason; message?: ChatMessage; metrics: ModelCallMetrics }> {
  const remainingMs = Math.max(1, Math.ceil(deadline - performance.now()));
  const requestStartedAt = performance.now();
  const payload = JSON.stringify({
    model: ACTIVE_MODEL,
    messages: conversation,
    stream: true,
    stream_options: { include_usage: true },
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
  });
  const payloadDir = await mkdtemp(join(tmpdir(), "scaffold-bench-payload-"));
  const payloadPath = join(payloadDir, "request.json");
  await writeFile(payloadPath, payload, "utf-8");
  const headers = ["-H", "content-type: application/json"];
  if (API_KEY) {
    headers.push("-H", `authorization: Bearer ${API_KEY}`);
  }
  const proc = spawn({
    cmd: [
      "curl",
      "-sS",
      "-N",
      "-X",
      "POST",
      ...headers,
      "--max-time",
      String(Math.max(1, Math.ceil(remainingMs / 1000))),
      "--data-binary",
      `@${payloadPath}`,
      DEFAULT_ENDPOINT,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  let content = "";
  let finishReason: FinishReason = "stop";
  const toolCallsByIndex = new Map<number, { id: string; name: string; arguments: string }>();
  let usage: ChatResponse["usage"];
  let timings: ChatResponse["timings"];
  let errorMessage: string | undefined;
  let buffer = "";
  let stderrText = "";
  let rawBody = "";
  let sawSseLine = false;

  try {
    const stderrPromise = streamToString(proc.stderr).then((s) => {
      stderrText = s;
    });
    const decoder = new TextDecoder();

    for await (const chunk of proc.stdout) {
      const text = decoder.decode(chunk, { stream: true });
      rawBody += text;
      buffer += text;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trimEnd();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        sawSseLine = true;
        const data = line.slice(5).trim();
        if (data === "" || data === "[DONE]") continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const result = Schema.decodeUnknownEither(ChatStreamChunkSchema)(parsed);
        if (Either.isLeft(result)) {
          console.error("[stream] chunk decode error:", result.left.message);
          continue;
        }
        const evt = result.right;

        if (evt.error?.message) errorMessage = evt.error.message;
        if (evt.usage) {
          usage = {
            prompt_tokens: evt.usage.prompt_tokens,
            completion_tokens: evt.usage.completion_tokens,
            total_tokens: evt.usage.total_tokens,
          };
        }
        if (evt.timings) {
          timings = {
            prompt_n: evt.timings.prompt_n,
            prompt_ms: evt.timings.prompt_ms,
            prompt_per_second: evt.timings.prompt_per_second,
            predicted_n: evt.timings.predicted_n,
            predicted_ms: evt.timings.predicted_ms,
            predicted_per_second: evt.timings.predicted_per_second,
          };
        }

        const choice = evt.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = narrowFinishReason(choice.finish_reason);

        const delta = choice.delta;
        if (!delta) continue;

        if (typeof delta.content === "string" && delta.content.length > 0) {
          content += delta.content;
          onDelta?.(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            const existing = toolCallsByIndex.get(idx) ?? { id: "", name: "", arguments: "" };
            if (typeof tc.id === "string") existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (typeof tc.function?.arguments === "string") {
              existing.arguments += tc.function.arguments;
            }
            toolCallsByIndex.set(idx, existing);
          }
        }
      }
    }

    const exitCode = await proc.exited;
    await stderrPromise;
    if (exitCode !== 0) {
      throw new Error(stderrText.trim() || `curl exited with code ${exitCode}`);
    }
    if (errorMessage) throw new Error(errorMessage);
    if (!sawSseLine) {
      const trimmed = rawBody.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(trimmed);
          const msg = parsed?.error?.message ?? parsed?.message ?? trimmed;
          throw new Error(`non-SSE response from ${DEFAULT_ENDPOINT}: ${String(msg).slice(0, 500)}`);
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("non-SSE")) throw e;
          throw new Error(`non-SSE response from ${DEFAULT_ENDPOINT}: ${trimmed.slice(0, 500)}`);
        }
      }
      throw new Error(`empty response body from ${DEFAULT_ENDPOINT}`);
    }

    const requestFinishedAt = performance.now();
    const toolCalls: OpenAIToolCall[] = [...toolCallsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => ({
        id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments || "{}" },
      }));

    const message: ChatMessage = {
      role: "assistant",
      content,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };

    return {
      finishReason: toolCalls.length > 0 ? "tool_calls" : finishReason,
      message,
      metrics: extractModelCallMetrics(
        { usage, timings, choices: [{ finish_reason: finishReason, message }] },
        requestFinishedAt - requestStartedAt
      ),
    };
  } catch (error) {
    if (error instanceof Error && /timed out/i.test(error.message)) {
      throw new Error("TIMEOUT");
    }
    throw error;
  } finally {
    await rm(payloadDir, { recursive: true, force: true });
  }
}

async function executeTool(call: OpenAIToolCall, cwd: string): Promise<ToolResult> {
  const rawArgs = call.function.arguments ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return err(`invalid tool arguments JSON: ${detail}`);
  }

  try {
    switch (call.function.name) {
      case "read":
        return ok(await runRead(Schema.decodeUnknownSync(ReadArgsSchema)(parsed), cwd));
      case "ls":
        return ok(await runLs(Schema.decodeUnknownSync(LsArgsSchema)(parsed), cwd));
      case "grep":
        return ok(await runGrep(Schema.decodeUnknownSync(GrepArgsSchema)(parsed), cwd));
      case "glob":
        return ok(await runGlob(Schema.decodeUnknownSync(GlobArgsSchema)(parsed), cwd));
      case "edit":
        return ok(await runEdit(Schema.decodeUnknownSync(EditArgsSchema)(parsed), cwd));
      case "write":
        return ok(await runWrite(Schema.decodeUnknownSync(WriteArgsSchema)(parsed), cwd));
      case "bash":
        return ok(await runBash(Schema.decodeUnknownSync(BashArgsSchema)(parsed), cwd));
      default:
        return err(`unknown tool "${call.function.name}"`);
    }
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

function finishRuntime(
  stdoutLines: string[],
  toolCalls: ToolCall[],
  startedAt: number,
  error?: string,
  modelMetrics?: ModelMetrics,
  extras?: Pick<RuntimeOutput, "firstTokenMs" | "turnWallTimes" | "turnFirstTokenMs" | "scenarioMetrics">
): RuntimeOutput {
  return {
    stdout: stdoutLines.join("\n"),
    toolCalls: toolCalls.map((call) => ({ ...call })),
    wallTimeMs: Math.round(performance.now() - startedAt) as Ms,
    ...(extras?.firstTokenMs !== undefined ? { firstTokenMs: extras.firstTokenMs } : {}),
    ...(extras?.turnWallTimes ? { turnWallTimes: extras.turnWallTimes } : {}),
    ...(extras?.turnFirstTokenMs ? { turnFirstTokenMs: extras.turnFirstTokenMs } : {}),
    ...(extras?.scenarioMetrics ? { scenarioMetrics: extras.scenarioMetrics } : {}),
    ...(modelMetrics ? { modelMetrics: { ...modelMetrics } } : {}),
    ...(error ? { error } : {}),
  };
}

// This function IS the sandbox guard — `as SafeRelativePath` is justified
// because every escape path throws above this return.
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

function readRootConfig(): { endpoint?: string; model?: string } {
  if (!existsSync(ROOT_CONFIG_PATH)) return {};

  const raw = readFileSync(ROOT_CONFIG_PATH, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid root config JSON: ${detail}`);
  }
  return Schema.decodeUnknownSync(RootConfigSchema)(parsed);
}

function readSystemPrompt(): string | undefined {
  if (!existsSync(SYSTEM_PROMPT_PATH)) return undefined;
  return readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
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
  response: ChatResponse,
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
