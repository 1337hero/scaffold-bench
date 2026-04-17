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
  mode: string;
  timeoutMs: number;
  onEvent?: (event: RuntimeEvent) => void;
}

export interface Runtime {
  name: string;
  run(ctx: RuntimeContext): Promise<RuntimeOutput>;
}
