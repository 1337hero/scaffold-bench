import { spawn } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ModelMetrics, RuntimeOutput, ToolCall } from "../scoring.ts";
import type { Runtime, RuntimeContext, RuntimeSession, RuntimeSessionContext } from "./types.ts";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const ROOT_CONFIG_PATH = join(PROJECT_ROOT, "scaffold.config.json");
const SYSTEM_PROMPT_PATH = join(PROJECT_ROOT, "system-prompt.md");
const rootConfig = readRootConfig();
const DEFAULT_ENDPOINT = normalizeEndpoint(
  Bun.env.SCAFFOLD_ENDPOINT ?? rootConfig.endpoint ?? "http://127.0.0.1:8082"
);
const DEFAULT_MODEL = Bun.env.SCAFFOLD_MODEL ?? rootConfig.model;
if (!DEFAULT_MODEL) {
  throw new Error(
    "No model configured. Set SCAFFOLD_MODEL env var or add a `model` entry to scaffold.config.json."
  );
}
const ACTIVE_MODEL = DEFAULT_MODEL;
const API_KEY = Bun.env.SCAFFOLD_API_KEY;
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

type RuntimeTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(args: string, cwd: string): Promise<string>;
};

const tools: RuntimeTool[] = [
  {
    name: "read",
    description:
      "Read the contents of a file at the given relative path. Returns file contents as a string.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path of the file to read",
        },
      },
      required: ["path"],
    },
    async run(args, cwd) {
      const input = parseArgs(args);
      const path = getRequiredString(input, "path");
      const filePath = resolveToolPath(cwd, path);
      const data = await readFile(filePath, "utf-8");
      return data;
    },
  },
  {
    name: "ls",
    description:
      "List files and directories at the given path. If no path is provided, lists the current directory. Directories are marked with a trailing slash.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional relative path. Defaults to current directory.",
        },
      },
    },
    async run(args, cwd) {
      const input = parseArgs(args);
      const path = getOptionalString(input, "path") ?? ".";
      const dirPath = resolveToolPath(cwd, path);
      const entries = await readdir(dirPath, { withFileTypes: true });
      return JSON.stringify(
        entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
      );
    },
  },
  {
    name: "grep",
    description:
      "Search for a regex pattern across files using ripgrep. Returns matches as file:line:content. Use this to find where things are defined or referenced.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for",
        },
        path: {
          type: "string",
          description: "Optional path to search. Defaults to current directory.",
        },
        glob: {
          type: "string",
          description: "Optional glob to filter files (e.g. '*.go', '**/*.md').",
        },
        ignore_case: {
          type: "boolean",
          description: "Case-insensitive search. Defaults to false.",
        },
      },
      required: ["pattern"],
    },
    async run(args, cwd) {
      const input = parseArgs(args);
      const pattern = getRequiredString(input, "pattern");
      const path = getOptionalString(input, "path");
      const glob = getOptionalString(input, "glob");
      const ignoreCase = getOptionalBoolean(input, "ignore_case") ?? false;

      const cmd = ["rg", "--line-number", "--no-heading", "--color=never"];
      if (ignoreCase) cmd.push("-i");
      if (glob) cmd.push("--glob", glob);
      cmd.push("--", pattern);
      if (path) {
        cmd.push(resolveToolPath(cwd, path));
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
    },
  },
  {
    name: "glob",
    description:
      "Find files by glob pattern using ripgrep file listing. Returns matching file paths, one per line.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern to match (e.g. '*.ts', '**/*.md').",
        },
        path: {
          type: "string",
          description: "Optional path to search within. Defaults to current directory.",
        },
      },
      required: ["pattern"],
    },
    async run(args, cwd) {
      const input = parseArgs(args);
      const pattern = getRequiredString(input, "pattern");
      const path = getOptionalString(input, "path");

      const cmd = ["rg", "--files", "--glob", pattern];
      if (path) {
        cmd.push(resolveToolPath(cwd, path));
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
    },
  },
  {
    name: "edit",
    description: `Edit a file by replacing old_str with new_str.

Rules:
- old_str must match EXACTLY once in the file (including whitespace). If it appears zero or multiple times, the edit fails.
- If the file does not exist AND old_str is empty, the file is created with new_str as its contents.
- old_str and new_str must differ.`,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path of the file to edit",
        },
        old_str: {
          type: "string",
          description: "Exact substring to replace. Empty to create a new file.",
        },
        new_str: {
          type: "string",
          description: "Replacement string.",
        },
      },
      required: ["path", "old_str", "new_str"],
    },
    async run(args, cwd) {
      const input = parseArgs(args);
      const path = getRequiredString(input, "path");
      const oldStr = getRequiredString(input, "old_str");
      const newStr = getRequiredString(input, "new_str");
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
    },
  },
  {
    name: "write",
    description:
      "Write a complete file at the given relative path. Creates parent directories if needed and overwrites existing contents.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path of the file to write",
        },
        content: {
          type: "string",
          description: "Full file contents to write.",
        },
      },
      required: ["path", "content"],
    },
    async run(args, cwd) {
      const input = parseArgs(args);
      const path = getRequiredString(input, "path");
      const content = getRequiredString(input, "content");

      const filePath = resolveToolPath(cwd, path);
      const existed = existsSync(filePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, "utf-8");
      return existed ? `updated ${path}` : `created ${path}`;
    },
  },
  {
    name: "bash",
    description:
      "Run a shell command with cwd set to the scenario working directory. Use this for tests, builds, linting, and command-line inspection.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute.",
        },
        timeout_ms: {
          type: "number",
          description: `Optional timeout in milliseconds. Defaults to ${DEFAULT_BASH_TIMEOUT_MS} and is capped at ${MAX_BASH_TIMEOUT_MS}.`,
        },
      },
      required: ["command"],
    },
    async run(args, cwd) {
      const input = parseArgs(args);
      const command = getRequiredString(input, "command");
      const requestedTimeout = getOptionalNumber(input, "timeout_ms");

      const timeoutMs = Math.min(
        MAX_BASH_TIMEOUT_MS,
        Math.max(1, Math.floor(requestedTimeout ?? DEFAULT_BASH_TIMEOUT_MS))
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
    },
  },
];

const toolRegistry = new Map(tools.map((tool) => [tool.name, tool]));

type ModelCallMetrics = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalRequestTimeMs: number;
  promptEvalTokens?: number;
  promptEvalTimeMs?: number;
  completionEvalTokens?: number;
  completionEvalTimeMs?: number;
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
    const extract = (data: JsonObject): number | undefined => {
      const settings = data.default_generation_settings;
      if (settings && typeof settings === "object") {
        const n = (settings as JsonObject).n_ctx;
        if (typeof n === "number" && Number.isFinite(n)) return n;
      }
      const top = data.n_ctx;
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
      return extract((await res.json()) as JsonObject);
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
      let firstTokenMs: number | undefined;

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
              firstTokenMs = Math.round(performance.now() - startedAt);
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
          ctx.onEvent?.({ type: "tool_result", call: toolCall, result });
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            content: result,
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

        let evt: any;
        try {
          evt = JSON.parse(data);
        } catch {
          continue;
        }

        if (evt.error?.message) errorMessage = evt.error.message;
        if (evt.usage) usage = parseUsage(evt.usage);
        if (evt.timings) timings = parseTimings(evt.timings);

        const choice = evt.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = parseFinishReason(choice.finish_reason);

        const delta = choice.delta;
        if (!delta) continue;

        if (typeof delta.content === "string" && delta.content.length > 0) {
          content += delta.content;
          onDelta?.(delta.content);
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
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

async function executeTool(call: OpenAIToolCall, cwd: string): Promise<string> {
  const tool = toolRegistry.get(call.function.name);
  if (!tool) {
    return `error: unknown tool "${call.function.name}"`;
  }

  try {
    return await tool.run(call.function.arguments ?? "{}", cwd);
  } catch (error) {
    return `error: ${error instanceof Error ? error.message : String(error)}`;
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
    wallTimeMs: Math.round(performance.now() - startedAt),
    ...(extras?.firstTokenMs !== undefined ? { firstTokenMs: extras.firstTokenMs } : {}),
    ...(extras?.turnWallTimes ? { turnWallTimes: extras.turnWallTimes } : {}),
    ...(extras?.turnFirstTokenMs ? { turnFirstTokenMs: extras.turnFirstTokenMs } : {}),
    ...(extras?.scenarioMetrics ? { scenarioMetrics: extras.scenarioMetrics } : {}),
    ...(modelMetrics ? { modelMetrics: { ...modelMetrics } } : {}),
    ...(error ? { error } : {}),
  };
}

function parseArgs(args: string): JsonObject {
  const parsed = parseJson(args, "tool arguments");
  if (!isRecord(parsed)) {
    throw new Error("tool arguments must be a JSON object");
  }
  return parsed;
}

function resolveToolPath(cwd: string, relativePath: string): string {
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
  return resolvedPath;
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
  const parsed = parseJson(raw, "root config");
  if (!isRecord(parsed)) {
    throw new Error("root config must be a JSON object");
  }
  return {
    endpoint: getOptionalString(parsed, "endpoint"),
    model: getOptionalString(parsed, "model"),
  };
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

function parseChatResponse(raw: string): ChatResponse {
  const parsed = parseJson(raw, "model response");
  if (!isRecord(parsed)) {
    throw new Error("model response must be a JSON object");
  }

  const choicesValue = parsed.choices;
  const errorValue = parsed.error;
  const usageValue = parsed.usage;
  const timingsValue = parsed.timings;
  return {
    choices: choicesValue === undefined ? undefined : parseChoices(choicesValue),
    error: errorValue === undefined ? undefined : parseErrorPayload(errorValue),
    usage: usageValue === undefined ? undefined : parseUsage(usageValue),
    timings: timingsValue === undefined ? undefined : parseTimings(timingsValue),
    prompt_eval_count: getOptionalNumber(parsed, "prompt_eval_count"),
    prompt_eval_duration: getOptionalNumber(parsed, "prompt_eval_duration"),
    eval_count: getOptionalNumber(parsed, "eval_count"),
    eval_duration: getOptionalNumber(parsed, "eval_duration"),
    total_duration: getOptionalNumber(parsed, "total_duration"),
  };
}

function parseChoices(value: unknown): ChatResponse["choices"] {
  if (!Array.isArray(value)) {
    throw new Error("model response choices must be an array");
  }
  return value.map((choice) => {
    if (!isRecord(choice)) {
      throw new Error("model response choice must be an object");
    }
    return {
      finish_reason: parseFinishReason(choice.finish_reason),
      message: choice.message === undefined ? undefined : parseChatMessage(choice.message),
    };
  });
}

function parseErrorPayload(value: unknown): { message?: string } {
  if (!isRecord(value)) {
    throw new Error("model response error must be an object");
  }
  return { message: getOptionalString(value, "message") };
}

function parseUsage(value: unknown): NonNullable<ChatResponse["usage"]> {
  if (!isRecord(value)) {
    throw new Error("model response usage must be an object");
  }
  return {
    prompt_tokens: getOptionalNumber(value, "prompt_tokens"),
    completion_tokens: getOptionalNumber(value, "completion_tokens"),
    total_tokens: getOptionalNumber(value, "total_tokens"),
  };
}

function parseTimings(value: unknown): NonNullable<ChatResponse["timings"]> {
  if (!isRecord(value)) {
    throw new Error("model response timings must be an object");
  }
  return {
    prompt_n: getOptionalNumber(value, "prompt_n"),
    prompt_ms: getOptionalNumber(value, "prompt_ms"),
    prompt_per_second: getOptionalNumber(value, "prompt_per_second"),
    predicted_n: getOptionalNumber(value, "predicted_n"),
    predicted_ms: getOptionalNumber(value, "predicted_ms"),
    predicted_per_second: getOptionalNumber(value, "predicted_per_second"),
  };
}

function parseChatMessage(value: unknown): ChatMessage {
  if (!isRecord(value)) {
    throw new Error("model message must be an object");
  }

  const role = value.role;
  if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
    throw new Error(`unsupported message role: ${String(role)}`);
  }

  const content = value.content;
  const normalizedContent =
    content === null || content === undefined
      ? ""
      : typeof content === "string"
        ? content
        : (() => {
            throw new Error("model message content must be a string or null");
          })();

  return {
    role,
    content: normalizedContent,
    ...(getOptionalString(value, "tool_call_id")
      ? { tool_call_id: getOptionalString(value, "tool_call_id") }
      : {}),
    ...(value.tool_calls === undefined ? {} : { tool_calls: parseToolCalls(value.tool_calls) }),
  };
}

function parseToolCalls(value: unknown): OpenAIToolCall[] {
  if (!Array.isArray(value)) {
    throw new Error("tool_calls must be an array");
  }
  return value.map((call) => {
    if (!isRecord(call)) {
      throw new Error("tool call must be an object");
    }
    const type = call.type;
    if (type !== "function") {
      throw new Error(`unsupported tool call type: ${String(type)}`);
    }
    const fn = call.function;
    if (!isRecord(fn)) {
      throw new Error("tool call function payload must be an object");
    }
    return {
      id: getRequiredString(call, "id"),
      type,
      function: {
        name: getRequiredString(fn, "name"),
        arguments: getOptionalString(fn, "arguments") ?? "{}",
      },
    };
  });
}

function parseFinishReason(value: unknown): FinishReason {
  if (value === undefined || value === "stop") return "stop";
  if (value === "tool_calls" || value === "function_call") return "tool_calls";
  if (value === "length" || value === "content_filter") return value;
  throw new Error(`unsupported finish_reason: ${String(value)}`);
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid ${label} JSON: ${detail}`);
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequiredString(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

function getOptionalString(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${key} must be a string`);
  }
  return value;
}

function getOptionalBoolean(source: JsonObject, key: string): boolean | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function getOptionalNumber(source: JsonObject, key: string): number | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number`);
  }
  return value;
}

function createModelMetrics(model: string): ModelMetrics {
  return {
    model,
    requestCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalRequestTimeMs: 0,
  };
}

function applyModelCallMetrics(target: ModelMetrics, metrics: ModelCallMetrics): void {
  target.requestCount += 1;
  target.promptTokens += metrics.promptTokens;
  target.completionTokens += metrics.completionTokens;
  target.totalTokens += metrics.totalTokens;
  target.totalRequestTimeMs += metrics.totalRequestTimeMs;

  if (metrics.promptEvalTokens !== undefined && metrics.promptEvalTimeMs !== undefined) {
    target.promptEvalTokens = (target.promptEvalTokens ?? 0) + metrics.promptEvalTokens;
    target.promptEvalTimeMs = (target.promptEvalTimeMs ?? 0) + metrics.promptEvalTimeMs;
  }

  if (
    metrics.completionEvalTokens !== undefined &&
    metrics.completionEvalTimeMs !== undefined
  ) {
    target.completionEvalTokens =
      (target.completionEvalTokens ?? 0) + metrics.completionEvalTokens;
    target.completionEvalTimeMs =
      (target.completionEvalTimeMs ?? 0) + metrics.completionEvalTimeMs;
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
    response.timings?.prompt_ms ?? durationNsToMs(response.prompt_eval_duration);
  const completionEvalTimeMs =
    response.timings?.predicted_ms ?? durationNsToMs(response.eval_duration);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    totalRequestTimeMs: requestTimeMs,
    ...(promptEvalTimeMs !== undefined && promptEvalTokens !== undefined
      ? { promptEvalTokens, promptEvalTimeMs }
      : {}),
    ...(completionEvalTimeMs !== undefined
      && completionEvalTokens !== undefined
      ? { completionEvalTokens, completionEvalTimeMs }
      : {}),
  };
}

function durationNsToMs(value: number | undefined): number | undefined {
  return value === undefined ? undefined : value / 1_000_000;
}
