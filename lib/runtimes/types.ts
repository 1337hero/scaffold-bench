import type { ModelMetrics, RuntimeOutput, ToolCall } from "../scoring.ts";
import type { ToolResult } from "../schemas/tool-result.js";

export type RuntimeEvent =
  | { type: "assistant"; content: string }
  | { type: "assistant_delta"; content: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; call: ToolCall; result: string }
  | { type: "model_metrics"; metrics: ModelMetrics };

export interface BeforeToolCallInput {
  id: string;
  name: string;
  rawArgs: string;
  parsedArgs: unknown;
  workDir: string;
}

export interface BeforeToolCallResult {
  block?: boolean;
  reason?: string;
}

export interface AfterToolCallInput extends BeforeToolCallInput {
  result: ToolResult;
}

export type ToolExecutionMode = "sequential" | "parallel";

export interface RuntimeContext {
  workDir: string;
  prompt: string;
  timeoutMs: number;
  onEvent?: (event: RuntimeEvent) => void;
  toolExecution?: ToolExecutionMode;
  beforeToolCall?:
    | ((input: BeforeToolCallInput) => Promise<BeforeToolCallResult | void>)
    | ((input: BeforeToolCallInput) => BeforeToolCallResult | void);
  afterToolCall?:
    | ((input: AfterToolCallInput) => Promise<ToolResult | void>)
    | ((input: AfterToolCallInput) => ToolResult | void);
  signal?: AbortSignal;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
}

export interface RuntimeSessionContext {
  workDir: string;
  onEvent?: (event: RuntimeEvent) => void;
  toolExecution?: RuntimeContext["toolExecution"];
  beforeToolCall?: RuntimeContext["beforeToolCall"];
  afterToolCall?: RuntimeContext["afterToolCall"];
  signal?: AbortSignal;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
}

export interface RuntimeSession {
  runTurn(prompt: string, timeoutMs: number): Promise<RuntimeOutput>;
  close?(): Promise<void>;
}

export interface RuntimeMetadata {
  runtimeKind: "llama.cpp" | "llama-swap" | "vllm" | "ollama" | "lmstudio" | "remote-openai";
  modelFile?: string | null;
  contextSize?: number | null;
}

export interface Runtime {
  name: string;
  run(ctx: RuntimeContext): Promise<RuntimeOutput>;
  startSession?(ctx: RuntimeSessionContext): Promise<RuntimeSession>;
  // Advertise the active model's context window in tokens, if knowable.
  // Used by scenarios (e.g. SB-23) to gracefully skip when the prompt
  // exceeds what the model can ingest.
  getContextWindow?(ctx?: RuntimeSessionContext): Promise<number | undefined>;
  // Capture per-run metadata for the runs row (quant, sampling, backend).
  // All fields are optional — runtimes return what they can probe.
  getMetadata?(ctx?: RuntimeSessionContext): Promise<RuntimeMetadata>;
}
