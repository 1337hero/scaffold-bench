import type { ModelMetrics, RuntimeOutput, ToolCall } from "../scoring.ts";

export type RuntimeEvent =
  | { type: "assistant"; content: string }
  | { type: "assistant_delta"; content: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "tool_result"; call: ToolCall; result: string }
  | { type: "model_metrics"; metrics: ModelMetrics };

export interface RuntimeContext {
  workDir: string;
  prompt: string;
  timeoutMs: number;
  onEvent?: (event: RuntimeEvent) => void;
}

export interface RuntimeSessionContext {
  workDir: string;
  onEvent?: (event: RuntimeEvent) => void;
}

export interface RuntimeSession {
  runTurn(prompt: string, timeoutMs: number): Promise<RuntimeOutput>;
  close?(): Promise<void>;
}

export interface Runtime {
  name: string;
  run(ctx: RuntimeContext): Promise<RuntimeOutput>;
  startSession?(ctx: RuntimeSessionContext): Promise<RuntimeSession>;
  // Advertise the active model's context window in tokens, if knowable.
  // Used by scenarios (e.g. SB-23) to gracefully skip when the prompt
  // exceeds what the model can ingest.
  getContextWindow?(): Promise<number | undefined>;
}
