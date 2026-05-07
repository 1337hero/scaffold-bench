import { Schema } from "effect";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runScenario } from "../lib/orchestrator.ts";
import { localRuntime } from "../lib/runtimes/local-agent.ts";
import { scenarios as allScenarios } from "../lib/scenarios/index.js";
import { RunFileSchema } from "../lib/schemas/run-file.ts";
import { computeRunTotals, type ScenarioLike } from "../lib/aggregates.ts";
import { classifyRuntimeError, mergeModelMetrics } from "../lib/scoring.ts";
import type { ScenarioResult, RuntimeErrorKind } from "../lib/scoring.ts";
import type { ScenarioEvaluation } from "../lib/schemas/evaluation.js";
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
import { detectGpu } from "../lib/hardware/gpu.ts";
import {
  parseQuantTag,
  quantTagToTier,
  detectQuantSource,
} from "../lib/scenarios/_shared/quant.ts";

export interface RunBenchOptions {
  runId?: string;
  scenarioIds: string[];
  model?: string;
  endpoint?: string;
  apiKey?: string;
  systemPrompt?: string;
  toolExecution?: ToolExecutionMode;
  timeoutMs?: number;
  nextSeq?: () => number;
  onEvent?: (event: PersistedEvent) => void;
  signal?: AbortSignal;
}

const RUNTIME_ERROR_KINDS = new Set<string>(["infra", "timeout", "aborted", "runtime"]);

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
  let _seq = 0;
  const nextSeq = opts.nextSeq ?? (() => _seq++);

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
      rubricKind: scenario.rubricKind,
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
        rubricKind: result.evaluation.rubricKind,
        rubricBreakdown: result.evaluation.rubricBreakdown ?? null,
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

  const resultLikes: ScenarioLike[] = results.map((r) => ({
    id: r.scenarioId,
    category: r.category,
    stage: "done" as const,
    toolCalls: r.output.toolCalls,
    result: r,
  }));
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

function scenarioErrorKind(result: ScenarioResult): RuntimeErrorKind | undefined {
  const fromMetrics = result.output.scenarioMetrics?.runtimeErrorKind;
  if (typeof fromMetrics === "string" && RUNTIME_ERROR_KINDS.has(fromMetrics)) return fromMetrics as RuntimeErrorKind;
  if (!result.output.error) return undefined;
  return classifyRuntimeError(result.output.error).kind;
}

function mirrorScenarioState(runId: string, evt: PersistedEvent): void {
  if (evt.type === "scenario_started") {
    upsertScenarioRun({
      run_id: runId,
      scenario_id: evt.scenarioId,
      category: evt.category,
      family: evt.family ?? "regex-style",
      status: "running",
      started_at: evt.ts,
      max_points: evt.maxPoints,
      rubric_kind: evt.rubricKind ?? "10pt",
    });
  } else if (evt.type === "scenario_finished") {
    const eval_ = evt.evaluation as ScenarioEvaluation;
    upsertScenarioRun({
      run_id: runId,
      scenario_id: evt.scenarioId,
      status: evt.status,
      finished_at: evt.ts,
      points: evt.points,
      max_points: eval_?.maxPoints,
      wall_time_ms: evt.wallTimeMs,
      tool_call_count: evt.toolCallCount,
      first_token_ms: evt.firstTokenMs,
      rubric_kind: evt.rubricKind ?? "10pt",
      correctness: evt.rubricBreakdown?.correctness ?? null,
      scope: evt.rubricBreakdown?.scope ?? null,
      pattern: evt.rubricBreakdown?.pattern ?? null,
      verification: evt.rubricBreakdown?.verification ?? null,
      cleanup: evt.rubricBreakdown?.cleanup ?? null,
      evaluation_json: JSON.stringify(evt.evaluation),
      error_kind: evt.errorKind ?? null,
      model_metrics_json: evt.modelMetrics ? JSON.stringify(evt.modelMetrics) : null,
    });
  }
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

async function executeRun(
  runId: string,
  request: StartRunRequest,
  controller: AbortController
): Promise<void> {
  try {
    const { resultsPath, totalPoints, maxPoints } = await runBench({
      runId,
      scenarioIds: request.scenarioIds,
      model: request.modelId,
      endpoint: request.endpoint,
      apiKey: request.apiKey,
      systemPrompt: request.systemPrompt,
      toolExecution: request.toolExecution,
      timeoutMs: request.timeoutMs,
      signal: controller.signal,
      nextSeq: () => globalRegistry.nextSeq(runId),
      onEvent: (evt) => {
        globalBus.publish(evt);
        insertEvent({
          run_id: runId,
          scenario_id: "scenarioId" in evt ? evt.scenarioId : null,
          seq: evt.seq,
          ts: evt.ts,
          type: evt.type,
          payload_json: JSON.stringify(evt),
        });
        mirrorScenarioState(runId, evt);
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
}

export async function startRun(request: StartRunRequest): Promise<{ runId: string }> {
  const runId = crypto.randomUUID();
  const controller = globalRegistry.create(runId);

  const scenarioIds = request.scenarioIds;
  const gpu = detectGpu();

  const metadata = await localRuntime
    .getMetadata?.({
      workDir: "",
      endpoint: request.endpoint,
      model: request.modelId,
      apiKey: request.apiKey,
    })
    .catch(() => undefined);

  const quantSource = metadata?.modelFile ? parseQuantTag(metadata.modelFile) : null;
  const quantTier = quantTagToTier(quantSource);
  const quantOriginKind = metadata?.modelFile ? detectQuantSource(metadata.modelFile) : null;

  insertRun({
    id: runId,
    started_at: Date.now(),
    status: "running",
    scenario_ids: JSON.stringify(scenarioIds),
    runtime: "local",
    runtime_kind: metadata?.runtimeKind ?? "llama.cpp",
    model: request.modelId ?? "unknown",
    model_file: metadata?.modelFile ?? null,
    quant: quantSource,
    quant_tier: quantTier,
    quant_source: quantOriginKind,
    context_size: metadata?.contextSize ?? null,
    endpoint: request.endpoint ?? null,
    gpu_backend: gpu.backend,
    gpu_model: gpu.model,
    gpu_count: gpu.count > 0 ? gpu.count : null,
    vram_total_mb: gpu.vramTotalMB,
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

  void executeRun(runId, request, controller);

  return { runId };
}
