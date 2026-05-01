import { Schema } from "effect";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runScenario } from "../lib/orchestrator.ts";
import { localRuntime } from "../lib/runtimes/local-agent.ts";
import { scenarios as allScenarios } from "../lib/scenarios.ts";
import { RunFileSchema } from "../lib/schemas/run-file.ts";
import { computeRunTotals, type ScenarioLike } from "../lib/aggregates.ts";
import { classifyRuntimeError, mergeModelMetrics } from "../lib/scoring.ts";
import type { ScenarioResult } from "../lib/scoring.ts";
import type { RuntimeErrorKind } from "../lib/scoring.ts";
import type { RuntimeEvent, ToolExecutionMode } from "../lib/runtimes/types.ts";
import { runtimeEventToPersisted } from "./contracts/events.ts";
import type { PersistedEvent } from "./contracts/events.ts";
import {
  insertRun,
  updateRun,
  upsertScenarioRun,
  insertEvent,
  withTransaction,
} from "./db/queries.ts";
import { globalBus } from "./event-bus.ts";
import { globalRegistry } from "./run-registry.ts";

export interface RunBenchOptions {
  runId?: string;
  scenarioIds: string[];
  model?: string;
  endpoint?: string;
  apiKey?: string;
  systemPrompt?: string;
  toolExecution?: ToolExecutionMode;
  timeoutMs?: number;
  onEvent?: (event: PersistedEvent) => void;
  signal?: AbortSignal;
}

function scenarioToLike(r: ScenarioResult): ScenarioLike {
  return {
    id: r.scenarioId,
    category: r.category,
    stage: "done",
    toolCalls: r.output.toolCalls,
    result: r,
  };
}

function isRuntimeErrorKind(value: unknown): value is RuntimeErrorKind {
  return value === "infra" || value === "timeout" || value === "aborted" || value === "runtime";
}

function scenarioErrorKind(result: ScenarioResult): RuntimeErrorKind | undefined {
  const fromMetrics = result.output.scenarioMetrics?.runtimeErrorKind;
  if (isRuntimeErrorKind(fromMetrics)) return fromMetrics;
  if (!result.output.error) return undefined;
  return classifyRuntimeError(result.output.error).kind;
}

export async function runBench(opts: RunBenchOptions): Promise<{
  results: ScenarioResult[];
  totalPoints: number;
  maxPoints: number;
  resultsPath: string;
}> {
  const runId = opts.runId ?? crypto.randomUUID();
  const activeScenarios = allScenarios.filter(
    (s) => opts.scenarioIds.includes(s.id) || opts.scenarioIds.includes(s.name)
  );
  if (activeScenarios.length === 0) {
    throw new Error(`No scenarios matched: ${opts.scenarioIds.join(", ")}`);
  }

  const timeoutMs = opts.timeoutMs ?? 600_000;
  const results: ScenarioResult[] = [];
  let seq = 0;
  const nextSeq = (): number => seq++;

  for (const scenario of activeScenarios) {
    if (opts.signal?.aborted) break;

    opts.onEvent?.({
      type: "scenario_started",
      runId,
      scenarioId: scenario.id,
      name: scenario.name,
      category: scenario.category,
      maxPoints: scenario.maxPoints ?? 10,
      family: scenario.family,
      rubricKind: "rubricKind" in scenario ? (scenario as any).rubricKind : undefined,
      seq: nextSeq(),
      ts: Date.now(),
    });

    try {
      const result = await runScenario({
        runtime: localRuntime,
        scenario,
        timeoutMs,
        toolExecution: opts.toolExecution,
        signal: opts.signal,
        runtimeOverrides: {
          endpoint: opts.endpoint,
          model: opts.model,
          apiKey: opts.apiKey,
          systemPrompt: opts.systemPrompt,
        },
        onRuntimeEvent: (event: RuntimeEvent) => {
          const persisted = runtimeEventToPersisted(event, {
            runId,
            scenarioId: scenario.id,
            seq: nextSeq(),
            ts: Date.now(),
          });
          opts.onEvent?.(persisted);
        },
      });

      results.push(result);
      const errorKind = scenarioErrorKind(result);

      opts.onEvent?.({
        type: "scenario_finished",
        runId,
        scenarioId: scenario.id,
        status: result.evaluation.status,
        points: result.evaluation.points,
        wallTimeMs: result.output.wallTimeMs,
        toolCallCount: result.output.toolCalls.length,
        firstTokenMs: result.output.firstTokenMs,
        turnWallTimes: result.output.turnWallTimes,
        turnFirstTokenMs: result.output.turnFirstTokenMs,
        evaluation: result.evaluation,
        modelMetrics: result.output.modelMetrics,
        ...(errorKind ? { errorKind } : {}),
        family: scenario.family,
        rubricKind: (result.evaluation as any).rubricKind,
        rubricBreakdown: (result.evaluation as any).rubricBreakdown ?? null,
        seq: nextSeq(),
        ts: Date.now(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      opts.onEvent?.({
        type: "scenario_finished",
        runId,
        scenarioId: scenario.id,
        status: "fail",
        points: 0,
        wallTimeMs: 0,
        toolCallCount: 0,
        evaluation: {
          status: "fail",
          points: 0,
          maxPoints: scenario.maxPoints ?? 10,
          checks: [],
          summary: errMsg,
        },
        seq: nextSeq(),
        ts: Date.now(),
      });
    }
  }

  const resultLikes = results.map(scenarioToLike);
  const { totalPoints, maxPoints } = computeRunTotals(resultLikes);
  const modelMetrics = mergeModelMetrics(results.map((r) => r.output.modelMetrics));

  const timestamp = Date.now();
  const resultsDir = join(import.meta.dir, "..", "results");
  await mkdir(resultsDir, { recursive: true });
  const resultsPath = join(resultsDir, `${timestamp}-local.json`);
  const runFile = {
    timestamp: new Date().toISOString(),
    runtime: "local",
    totalPoints,
    maxPoints,
    modelMetrics,
    results: results.map((r) => ({
      scenarioId: r.scenarioId,
      category: r.category,
      family: activeScenarios.find((s) => s.id === r.scenarioId)?.family,
      status: r.evaluation.status,
      points: r.evaluation.points,
      maxPoints: r.evaluation.maxPoints,
      rubricKind: r.evaluation.rubricKind,
      rubricBreakdown: r.evaluation.rubricBreakdown,
      toolCallCount: r.output.toolCalls.length,
      wallTimeMs: r.output.wallTimeMs,
      firstTokenMs: r.output.firstTokenMs,
      turnWallTimes: r.output.turnWallTimes,
      turnFirstTokenMs: r.output.turnFirstTokenMs,
      error: r.output.error,
      errorKind: scenarioErrorKind(r),
      modelMetrics: r.output.modelMetrics,
      scenarioMetrics: r.output.scenarioMetrics,
      checks: r.evaluation.checks,
      ...(r.evaluation.status !== "pass" && {
        transcript: r.output.stdout,
        toolCalls: r.output.toolCalls,
      }),
    })),
  };
  await Bun.write(resultsPath, JSON.stringify(Schema.encodeSync(RunFileSchema)(runFile), null, 2));

  return { results, totalPoints, maxPoints, resultsPath };
}

export interface StartRunRequest {
  scenarioIds: string[];
  modelId?: string;
  endpoint?: string;
  apiKey?: string;
  systemPrompt?: string;
  toolExecution?: ToolExecutionMode;
  timeoutMs?: number;
}

export async function startRun(request: StartRunRequest): Promise<{ runId: string }> {
  const runId = crypto.randomUUID();
  const controller = globalRegistry.create(runId);

  const scenarioIds = request.scenarioIds;
  insertRun({
    id: runId,
    started_at: Date.now(),
    status: "running",
    bench_version: "",
    git_dirty: 0,
    system_prompt_hash: null,
    scenario_ids: JSON.stringify(scenarioIds),
    runtime: "local",
    runtime_kind: "llama.cpp",
    runtime_build: null,
    model: request.modelId ?? "unknown",
    model_file: null,
    quant: null,
    quant_tier: null,
    quant_source: null,
    context_size: null,
    endpoint: request.endpoint ?? null,
    temperature: null,
    top_p: null,
    top_k: null,
    seed: null,
    max_tokens: null,
    gpu_backend: null,
    gpu_model: null,
    gpu_count: null,
    vram_total_mb: null,
    host_thermal_note: null,
  });

  const startEvent: PersistedEvent = {
    type: "run_started",
    runId,
    scenarioIds,
    model: request.modelId ?? null,
    endpoint: request.endpoint ?? null,
    seq: globalRegistry.nextSeq(runId),
    ts: Date.now(),
  };
  globalBus.publish(startEvent);
  insertEvent({
    run_id: runId,
    scenario_id: null,
    seq: startEvent.seq,
    ts: startEvent.ts,
    type: startEvent.type,
    payload_json: JSON.stringify(startEvent),
  });

  for (const scenarioId of scenarioIds) {
    const scenario = allScenarios.find((s) => s.id === scenarioId);
    upsertScenarioRun({
      run_id: runId,
      scenario_id: scenarioId,
      family: scenario?.family ?? "regex-style",
      rubric_kind: "10pt",
      status: "pending",
    });
  }

  void (async () => {
    try {
      const { resultsPath, totalPoints, maxPoints } = await runBench({
        runId,
        scenarioIds,
        model: request.modelId,
        endpoint: request.endpoint,
        apiKey: request.apiKey,
        systemPrompt: request.systemPrompt,
        toolExecution: request.toolExecution,
        timeoutMs: request.timeoutMs,
        signal: controller.signal,
        onEvent: (evt) => {
          // Re-sequence with globalRegistry so run-level and scenario-level seq share one counter
          const seq = globalRegistry.nextSeq(runId);
          const resequenced = { ...evt, seq } as PersistedEvent;
          globalBus.publish(resequenced);
          insertEvent({
            run_id: runId,
            scenario_id: "scenarioId" in resequenced ? resequenced.scenarioId : null,
            seq: resequenced.seq,
            ts: resequenced.ts,
            type: resequenced.type,
            payload_json: JSON.stringify(resequenced),
          });
          if (resequenced.type === "scenario_started") {
            upsertScenarioRun({
              run_id: runId,
              scenario_id: resequenced.scenarioId,
              category: resequenced.category,
              family: resequenced.family ?? "regex-style",
              status: "running",
              started_at: resequenced.ts,
              max_points: resequenced.maxPoints,
              rubric_kind: resequenced.rubricKind ?? "10pt",
            });
          } else if (resequenced.type === "scenario_finished") {
            upsertScenarioRun({
              run_id: runId,
              scenario_id: resequenced.scenarioId,
              status: resequenced.status,
              finished_at: resequenced.ts,
              points: resequenced.points,
              max_points:
                typeof (resequenced.evaluation as Record<string, unknown>).maxPoints === "number"
                  ? ((resequenced.evaluation as Record<string, unknown>).maxPoints as number)
                  : undefined,
              wall_time_ms: resequenced.wallTimeMs,
              tool_call_count: resequenced.toolCallCount,
              first_token_ms: resequenced.firstTokenMs,
              rubric_kind: resequenced.rubricKind ?? "10pt",
              correctness: resequenced.rubricBreakdown?.correctness ?? null,
              scope: resequenced.rubricBreakdown?.scope ?? null,
              pattern: resequenced.rubricBreakdown?.pattern ?? null,
              verification: resequenced.rubricBreakdown?.verification ?? null,
              cleanup: resequenced.rubricBreakdown?.cleanup ?? null,
              evaluation_json: JSON.stringify(resequenced.evaluation),
              error_kind: resequenced.errorKind ?? null,
              model_metrics_json: resequenced.modelMetrics
                ? JSON.stringify(resequenced.modelMetrics)
                : null,
            });
          }
        },
      });

      const finishEvent: PersistedEvent = {
        type: "run_finished",
        runId,
        totalPoints,
        maxPoints,
        reportPath: resultsPath,
        seq: globalRegistry.nextSeq(runId),
        ts: Date.now(),
      };
      withTransaction(() => {
        updateRun(runId, {
          status: "done",
          finished_at: finishEvent.ts,
          total_points: totalPoints,
          max_points: maxPoints,
          report_path: resultsPath,
        });
        insertEvent({
          run_id: runId,
          scenario_id: null,
          seq: finishEvent.seq,
          ts: finishEvent.ts,
          type: finishEvent.type,
          payload_json: JSON.stringify(finishEvent),
        });
      });
      globalBus.publish(finishEvent);
    } catch (err) {
      const isAbort = controller.signal.aborted;
      const errMsg = err instanceof Error ? err.message : String(err);
      const seq = globalRegistry.nextSeq(runId);
      const ts = Date.now();

      const stopOrFailEvent: PersistedEvent = isAbort
        ? { type: "run_stopped", runId, reason: "user requested stop", seq, ts }
        : { type: "run_failed", runId, error: errMsg, seq, ts };

      withTransaction(() => {
        updateRun(runId, {
          status: isAbort ? "stopped" : "failed",
          finished_at: ts,
          ...(isAbort ? {} : { error: errMsg }),
        });
        insertEvent({
          run_id: runId,
          scenario_id: null,
          seq,
          ts,
          type: stopOrFailEvent.type,
          payload_json: JSON.stringify(stopOrFailEvent),
        });
      });
      globalBus.publish(stopOrFailEvent);
    } finally {
      globalRegistry.delete(runId);
      globalBus.cleanup(runId);
    }
  })();

  return { runId };
}
