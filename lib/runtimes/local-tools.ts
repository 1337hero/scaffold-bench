import { spawn } from "bun";
import { Schema } from "effect";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  BashArgs,
  EditArgs,
  LsArgs,
  ReadArgs,
  SafeRelativePath,
  ToolResult,
  WriteArgs,
} from "../schemas/index.js";
import {
  BashArgsSchema,
  EditArgsSchema,
  LsArgsSchema,
  ReadArgsSchema,
  WriteArgsSchema,
  err,
  ok,
  toJsonSchema,
} from "../schemas/index.js";
import type { ToolCall } from "../scoring.ts";
import type { BeforeToolCallInput, RuntimeSessionContext } from "./types.ts";
import type { OpenAIToolCall } from "./local-model.ts";

export const OUTPUT_CAP = 8192;
export const DEFAULT_BASH_TIMEOUT_MS = 5000;
export const MAX_BASH_TIMEOUT_MS = 10000;
export const DEFAULT_TOOL_EXECUTION_MODE: RuntimeSessionContext["toolExecution"] = "sequential";
export const MAX_PARALLEL_SAFE_TOOL_CALLS = 8;
export const MAX_PARALLEL_BASH_CALLS = 2;

export type PendingToolExecution = {
  call: OpenAIToolCall;
  toolCall: ToolCall;
};

export type ToolHandler = {
  description: string;
  parameters: object;
  run: (args: unknown, cwd: string, signal?: AbortSignal) => Promise<string>;
};

export type ToolExecutionHooks = Pick<
  RuntimeSessionContext,
  "toolExecution" | "beforeToolCall" | "afterToolCall"
> & {
  signal?: AbortSignal;
};

export const toolHandlers: Record<string, ToolHandler> = {
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

export const openAiTools = Object.entries(toolHandlers).map(([name, tool]) => ({
  type: "function",
  function: {
    name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

export async function runRead(args: ReadArgs, cwd: string): Promise<string> {
  const filePath = resolveToolPath(cwd, args.path);
  return readFile(filePath, "utf-8");
}

export async function runLs(args: LsArgs, cwd: string): Promise<string> {
  const dirPath = resolveToolPath(cwd, args.path ?? ".");
  const entries = await readdir(dirPath, { withFileTypes: true });
  return JSON.stringify(
    entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  );
}

export async function runEdit(args: EditArgs, cwd: string): Promise<string> {
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

export async function runWrite(args: WriteArgs, cwd: string): Promise<string> {
  const { path, content } = args;
  const filePath = resolveToolPath(cwd, path);
  const existed = existsSync(filePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
  return existed ? `updated ${path}` : `created ${path}`;
}

export async function runBash(args: BashArgs, cwd: string, signal?: AbortSignal): Promise<string> {
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

export async function executeToolBatch(
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

export function isParallelSafeTool(name: string): boolean {
  return name === "read" || name === "ls" || name === "bash";
}

export function isBashTool(pending: PendingToolExecution): boolean {
  return pending.call.function.name === "bash";
}

export async function executeSafeBatchParallel(
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

export async function executeTool(
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

export function resolveToolPath(cwd: string, relativePath: string): SafeRelativePath {
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

export async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export function truncate(value: string): string {
  return value.length > OUTPUT_CAP ? `${value.slice(0, OUTPUT_CAP)}\n... [truncated]` : value;
}

export function killProcessGroup(proc: ReturnType<typeof spawn>): void {
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    proc.kill("SIGKILL");
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
