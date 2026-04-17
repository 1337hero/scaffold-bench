import type { RuntimeOutput, ToolCall } from "../scoring.ts";

export type RuntimeEvent =
  | { type: "assistant"; content: string }
  | { type: "tool_call"; call: ToolCall };

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
