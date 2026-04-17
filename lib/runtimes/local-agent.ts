import { spawn } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RuntimeOutput, ToolCall } from "../scoring.ts";
import type { Runtime, RuntimeContext } from "./types.ts";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const ROOT_CONFIG_PATH = join(PROJECT_ROOT, "scaffold.config.json");
const SYSTEM_PROMPT_PATH = join(PROJECT_ROOT, "system-prompt.md");
const rootConfig = readRootConfig();
const DEFAULT_ENDPOINT = normalizeEndpoint(
  Bun.env.SCAFFOLD_ENDPOINT ?? rootConfig.endpoint ?? "http://127.0.0.1:8082"
);
const DEFAULT_MODEL = Bun.env.SCAFFOLD_MODEL ?? rootConfig.model ?? "Qwopus3.5-27B-v3-Q6_K.gguf";
const API_KEY = Bun.env.SCAFFOLD_API_KEY;
const MAX_TOOL_ITERATIONS = 20;
const OUTPUT_CAP = 8192;
const DEFAULT_BASH_TIMEOUT_MS = 5000;
const MAX_BASH_TIMEOUT_MS = 10000;

const systemPrompt = readSystemPrompt();

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
    finish_reason?: string;
    message?: ChatMessage;
  }>;
  error?: {
    message?: string;
  };
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
      const input = parseArgs<{ path: string }>(args);
      if (!input.path) throw new Error("path is required");
      const filePath = resolveToolPath(cwd, input.path);
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
      const input = parseArgs<{ path?: string }>(args);
      const dirPath = resolveToolPath(cwd, input.path || ".");
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
      const input = parseArgs<{
        pattern: string;
        path?: string;
        glob?: string;
        ignore_case?: boolean;
      }>(args);
      if (!input.pattern) throw new Error("pattern is required");

      const cmd = ["rg", "--line-number", "--no-heading", "--color=never"];
      if (input.ignore_case) cmd.push("-i");
      if (input.glob) cmd.push("--glob", input.glob);
      cmd.push("--", input.pattern);
      if (input.path) {
        cmd.push(input.path);
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
      const input = parseArgs<{ pattern: string; path?: string }>(args);
      if (!input.pattern) throw new Error("pattern is required");

      const cmd = ["rg", "--files", "--glob", input.pattern];
      if (input.path) {
        cmd.push(input.path);
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
      const input = parseArgs<{ path: string; old_str: string; new_str: string }>(args);
      if (!input.path) throw new Error("path is required");
      if (input.old_str === input.new_str) throw new Error("old_str and new_str are identical");

      const filePath = resolveToolPath(cwd, input.path);
      if (!existsSync(filePath)) {
        if (input.old_str !== "") throw new Error(`file not found: ${input.path}`);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, input.new_str, "utf-8");
        return `created ${input.path}`;
      }

      const content = await readFile(filePath, "utf-8");
      const matches = content.split(input.old_str).length - 1;
      if (matches === 0) throw new Error(`old_str not found in ${input.path}`);
      if (matches > 1)
        throw new Error(`old_str appears ${matches} times in ${input.path}; must be unique`);

      await writeFile(filePath, content.replace(input.old_str, input.new_str), "utf-8");
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
      const input = parseArgs<{ path: string; content: string }>(args);
      if (!input.path) throw new Error("path is required");

      const filePath = resolveToolPath(cwd, input.path);
      const existed = existsSync(filePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content, "utf-8");
      return existed ? `updated ${input.path}` : `created ${input.path}`;
    },
  },
  {
    name: "bash",
    description:
      "Run a shell command in the scenario working directory. Use this for tests, builds, linting, and command-line inspection.",
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
      const input = parseArgs<{ command: string; timeout_ms?: number }>(args);
      if (!input.command) throw new Error("command is required");

      const timeoutMs = Math.min(
        MAX_BASH_TIMEOUT_MS,
        Math.max(1, Math.floor(input.timeout_ms ?? DEFAULT_BASH_TIMEOUT_MS))
      );
      const proc = spawn({
        cmd: [process.env.SHELL || "/bin/zsh", "-lc", input.command],
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
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

// Built-in local runtime for OpenAI-compatible chat-completions endpoints.
export const localRuntime: Runtime = {
  name: "local",

  async run(ctx: RuntimeContext): Promise<RuntimeOutput> {
    const startedAt = performance.now();
    const deadline = startedAt + ctx.timeoutMs;
    const conversation: ChatMessage[] = [];
    const transcript: string[] = [];
    const toolCalls: ToolCall[] = [];

    if (systemPrompt && ctx.mode !== "none") {
      conversation.push({ role: "system", content: systemPrompt });
    }
    conversation.push({ role: "user", content: ctx.prompt });

    let iterations = 0;

    while (true) {
      if (performance.now() >= deadline) {
        return finishRuntime(transcript, toolCalls, startedAt, "TIMEOUT");
      }

      const reply = await callModel(conversation, deadline);
      const message = reply.message;
      if (!message) {
        return finishRuntime(transcript, toolCalls, startedAt, "CRASH: missing assistant message");
      }

      conversation.push(message);

      if (message.content) {
        transcript.push(`Qwopus: ${message.content}`);
        ctx.onEvent?.({ type: "assistant", content: message.content });
      }

      if (reply.finishReason !== "tool_calls" || !message.tool_calls?.length) {
        return finishRuntime(transcript, toolCalls, startedAt);
      }

      iterations++;
      if (iterations > MAX_TOOL_ITERATIONS) {
        transcript.push(`guard: hit ${MAX_TOOL_ITERATIONS} tool iterations, stopping`);
        return finishRuntime(transcript, toolCalls, startedAt);
      }

      for (const call of message.tool_calls) {
        const args = call.function.arguments ?? "{}";
        transcript.push(`tool: ${call.function.name}(${args})`);
        const toolCall = {
          name: call.function.name,
          args,
          turn: toolCalls.length,
        } satisfies ToolCall;
        toolCalls.push(toolCall);
        ctx.onEvent?.({ type: "tool_call", call: toolCall });

        const result = await executeTool(call, ctx.workDir);
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
    }
  },
};

async function callModel(
  conversation: ChatMessage[],
  deadline: number
): Promise<{ finishReason: string; message?: ChatMessage }> {
  const remainingMs = Math.max(1, Math.ceil(deadline - performance.now()));
  const payload = JSON.stringify({
    model: DEFAULT_MODEL,
    messages: conversation,
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
  });
  const headers = ["-H", "content-type: application/json"];
  if (API_KEY) {
    headers.push("-H", `authorization: Bearer ${API_KEY}`);
  }
  const proc = spawn({
    cmd: [
      "curl",
      "-sS",
      "-X",
      "POST",
      ...headers,
      "--max-time",
      String(Math.max(1, Math.ceil(remainingMs / 1000))),
      "--data",
      payload,
      DEFAULT_ENDPOINT,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      streamToString(proc.stdout),
      streamToString(proc.stderr),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(stderr.trim() || `curl exited with code ${exitCode}`);
    }

    const parsed = JSON.parse(stdout) as ChatResponse;
    if (parsed.error?.message) {
      throw new Error(parsed.error.message);
    }

    const choice = parsed.choices?.[0];
    if (!choice) {
      throw new Error("no choices in model response");
    }

    return {
      finishReason: choice.finish_reason ?? "stop",
      message: choice.message,
    };
  } catch (error) {
    if (error instanceof Error && /timed out/i.test(error.message)) {
      throw new Error("TIMEOUT");
    }
    throw error;
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
  error?: string
): RuntimeOutput {
  return {
    stdout: stdoutLines.join("\n"),
    toolCalls,
    wallTimeMs: Math.round(performance.now() - startedAt),
    ...(error ? { error } : {}),
  };
}

function parseArgs<T>(args: string): T {
  return JSON.parse(args) as T;
}

function resolveToolPath(cwd: string, relativePath: string): string {
  return resolve(cwd, relativePath);
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
  const parsed = JSON.parse(raw) as { endpoint?: string; model?: string };
  return parsed;
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
