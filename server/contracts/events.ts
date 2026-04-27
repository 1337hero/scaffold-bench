import type { ModelMetrics, RuntimeErrorKind, ToolCall } from "../../lib/scoring.ts";
import type { RuntimeEvent } from "../../lib/runtimes/types.ts";

interface EventBase {
  seq: number;
  ts: number;
}

export type PersistedEvent =
  | (EventBase & {
      type: "run_started";
      runId: string;
      scenarioIds: string[];
      model: string | null;
      endpoint: string | null;
    })
  | (EventBase & {
      type: "run_finished";
      runId: string;
      totalPoints: number;
      maxPoints: number;
      reportPath: string | null;
    })
  | (EventBase & { type: "run_stopped"; runId: string; reason?: string })
  | (EventBase & { type: "run_failed"; runId: string; error: string })
  | (EventBase & {
      type: "scenario_started";
      runId: string;
      scenarioId: string;
      name?: string;
      category: string;
      maxPoints: number;
    })
  | (EventBase & {
      type: "scenario_finished";
      runId: string;
      scenarioId: string;
      status: "pass" | "partial" | "fail" | "stopped";
      points: number;
      wallTimeMs: number;
      toolCallCount: number;
      firstTokenMs?: number;
      turnWallTimes?: number[];
      turnFirstTokenMs?: Array<number | undefined>;
      evaluation: unknown;
      modelMetrics?: ModelMetrics;
      errorKind?: RuntimeErrorKind;
    })
  | (EventBase & {
      type: "assistant";
      runId: string;
      scenarioId: string;
      content: string;
    })
  | (EventBase & {
      type: "assistant_delta";
      runId: string;
      scenarioId: string;
      content: string;
    })
  | (EventBase & {
      type: "tool_call";
      runId: string;
      scenarioId: string;
      call: ToolCall;
    })
  | (EventBase & {
      type: "tool_result";
      runId: string;
      scenarioId: string;
      call: ToolCall;
      result: string;
    })
  | (EventBase & {
      type: "model_metrics";
      runId: string;
      scenarioId: string;
      metrics: ModelMetrics;
    });

export interface RuntimeEventContext {
  runId: string;
  scenarioId: string;
  seq: number;
  ts: number;
}

export function runtimeEventToPersisted(
  event: RuntimeEvent,
  ctx: RuntimeEventContext
): PersistedEvent {
  const base = { seq: ctx.seq, ts: ctx.ts };
  switch (event.type) {
    case "assistant":
      return {
        ...base,
        type: "assistant",
        runId: ctx.runId,
        scenarioId: ctx.scenarioId,
        content: event.content,
      };
    case "assistant_delta":
      return {
        ...base,
        type: "assistant_delta",
        runId: ctx.runId,
        scenarioId: ctx.scenarioId,
        content: event.content,
      };
    case "tool_call":
      return {
        ...base,
        type: "tool_call",
        runId: ctx.runId,
        scenarioId: ctx.scenarioId,
        call: event.call,
      };
    case "tool_result":
      return {
        ...base,
        type: "tool_result",
        runId: ctx.runId,
        scenarioId: ctx.scenarioId,
        call: event.call,
        result: event.result,
      };
    case "model_metrics":
      return {
        ...base,
        type: "model_metrics",
        runId: ctx.runId,
        scenarioId: ctx.scenarioId,
        metrics: event.metrics,
      };
  }
}
