import { callModel } from "../lib/runtimes/local-model.ts";
import { loadOneshotPrompts, type OneshotPrompt } from "../lib/oneshot/loader.ts";
import { globalBus } from "./event-bus.ts";
import { globalRegistry } from "./run-registry.ts";
import {
  clearPreviousOneshot,
  insertOneshotRun,
  updateOneshotRun,
  upsertOneshotResult,
} from "./db/oneshot-queries.ts";
import type { OneshotEvent } from "./contracts/oneshot-events.ts";

export interface OneshotEngineOptions {
  promptIds: string[];
  modelId: string;
  endpoint: string;
  apiKey?: string;
  onRunId?: (runId: string) => void;
}

export async function startOneshotRun(opts: OneshotEngineOptions): Promise<{ runId: string }> {
  const runId = crypto.randomUUID();
  const controller = globalRegistry.create(runId);

  opts.onRunId?.(runId);

  clearPreviousOneshot();
  insertOneshotRun({
    id: runId,
    started_at: Date.now(),
    status: "running",
    model: opts.modelId,
    endpoint: opts.endpoint,
    prompt_ids: JSON.stringify(opts.promptIds),
  });

  const prompts = loadOneshotPrompts();
  const selected = selectPrompts(prompts, opts.promptIds);
  if (selected.length === 0) {
    globalRegistry.delete(runId);
    throw new Error(`No matching prompts for: ${opts.promptIds.join(", ")}`);
  }

  publish({
    type: "oneshot_run_started",
    runId,
    promptIds: selected.map((p) => p.id),
    model: opts.modelId,
    seq: globalRegistry.nextSeq(runId),
    ts: Date.now(),
  });

  void (async () => {
    try {
      for (let i = 0; i < selected.length; i++) {
        if (controller.signal.aborted) {
          await stopAsAborted(runId);
          return;
        }

        const prompt = selected[i];
        const startedAt = Date.now();
        publish({
          type: "oneshot_test_started",
          runId,
          promptId: prompt.id,
          index: i,
          total: selected.length,
          seq: globalRegistry.nextSeq(runId),
          ts: startedAt,
        });

        const finished = await runPrompt({ runId, prompt, opts, signal: controller.signal });

        upsertOneshotResult({
          run_id: runId,
          prompt_id: prompt.id,
          started_at: startedAt,
          finished_at: finished.ts,
          status: finished.error ? "failed" : "done",
          output: finished.output,
          finish_reason: finished.finishReason,
          wall_time_ms: finished.wallTimeMs,
          first_token_ms: finished.firstTokenMs,
          prompt_tokens: finished.metrics?.promptTokens ?? null,
          completion_tokens: finished.metrics?.completionTokens ?? null,
          error: finished.error,
        });

        publish({
          type: "oneshot_test_finished",
          runId,
          promptId: prompt.id,
          output: finished.output,
          metrics: finished.metrics,
          finishReason: finished.finishReason,
          wallTimeMs: finished.wallTimeMs,
          firstTokenMs: finished.firstTokenMs,
          ...(finished.error ? { error: finished.error } : {}),
          seq: globalRegistry.nextSeq(runId),
          ts: finished.ts,
        });
      }

      updateOneshotRun(runId, { status: "done", finished_at: Date.now() });
      publish({
        type: "oneshot_run_finished",
        runId,
        seq: globalRegistry.nextSeq(runId),
        ts: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stopped = controller.signal.aborted || message === "stopped";
      updateOneshotRun(runId, {
        status: stopped ? "stopped" : "failed",
        finished_at: Date.now(),
        ...(stopped ? {} : { error: message }),
      });
      publish(
        stopped
          ? {
              type: "oneshot_run_stopped",
              runId,
              reason: "user requested stop",
              seq: globalRegistry.nextSeq(runId),
              ts: Date.now(),
            }
          : {
              type: "oneshot_run_failed",
              runId,
              error: message,
              seq: globalRegistry.nextSeq(runId),
              ts: Date.now(),
            }
      );
    } finally {
      globalRegistry.delete(runId);
      globalBus.cleanup(runId);
    }
  })();

  return { runId };
}

export function stopOneshotRun(runId: string): void {
  globalRegistry.get(runId)?.abort();
}

function selectPrompts(all: OneshotPrompt[], ids: string[]): OneshotPrompt[] {
  return ids
    .map((id) => all.find((p) => p.id === id))
    .filter((p): p is OneshotPrompt => Boolean(p));
}

function publish(event: OneshotEvent): void {
  globalBus.publish(event);
}

async function stopAsAborted(runId: string): Promise<void> {
  updateOneshotRun(runId, { status: "stopped", finished_at: Date.now() });
  publish({
    type: "oneshot_run_stopped",
    runId,
    reason: "user requested stop",
    seq: globalRegistry.nextSeq(runId),
    ts: Date.now(),
  });
}

async function runPrompt(params: {
  runId: string;
  prompt: OneshotPrompt;
  opts: OneshotEngineOptions;
  signal: AbortSignal;
}): Promise<{
  output: string;
  finishReason: string;
  metrics: { promptTokens: number; completionTokens: number } | null;
  wallTimeMs: number;
  firstTokenMs: number;
  error: string | null;
  ts: number;
}> {
  const startedAt = Date.now();
  let firstTokenMs = 0;
  const deadline = performance.now() + 120_000;

  try {
    const response = await callModel(
      [{ role: "user", content: params.prompt.prompt }],
      deadline,
      {
        endpoint: params.opts.endpoint,
        model: params.opts.modelId,
        apiKey: params.opts.apiKey,
        signal: params.signal,
      },
      [],
      (content) => {
        if (firstTokenMs === 0 && content.length > 0) {
          firstTokenMs = Date.now() - startedAt;
        }
        publish({
          type: "oneshot_delta",
          runId: params.runId,
          promptId: params.prompt.id,
          content,
          seq: globalRegistry.nextSeq(params.runId),
          ts: Date.now(),
        });
      }
    );

    return {
      output: response.message?.content ?? "",
      finishReason: response.finishReason,
      metrics: response.metrics
        ? {
            promptTokens: response.metrics.promptTokens,
            completionTokens: response.metrics.completionTokens,
          }
        : null,
      wallTimeMs: Date.now() - startedAt,
      firstTokenMs,
      error: null,
      ts: Date.now(),
    };
  } catch (error) {
    if (params.signal.aborted) {
      throw new Error("stopped", { cause: error });
    }

    return {
      output: "",
      finishReason: "error",
      metrics: null,
      wallTimeMs: Date.now() - startedAt,
      firstTokenMs,
      error: error instanceof Error ? error.message : String(error),
      ts: Date.now(),
    };
  }
}
