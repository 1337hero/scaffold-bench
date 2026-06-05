import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  clearRunData,
  insertRun,
  updateRun,
  upsertScenarioRun,
  withTransaction,
} from "../server/db/queries.ts";
import { closeDb, runMigrations } from "../server/db/migrations.ts";
import { tryGetMeta } from "../lib/scenarios/_shared/meta.ts";
import type { ScenarioMeta } from "../lib/scoring.ts";

type ModelMetrics = {
  model?: string;
  requestCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  totalRequestTimeMs?: number;
  promptEvalTokens?: number;
  promptEvalTimeMs?: number;
  completionEvalTokens?: number;
  completionEvalTimeMs?: number;
};

type ResultScenario = {
  scenarioId: string;
  category?: string;
  family?: string;
  status?: "pass" | "partial" | "fail";
  points?: number;
  maxPoints?: number;
  rubricKind?: string;
  rubricBreakdown?: {
    correctness?: number;
    scope?: number;
    pattern?: number;
    verification?: number;
    cleanup?: number;
  } | null;
  toolCallCount?: number;
  wallTimeMs?: number;
  firstTokenMs?: number;
  error?: string;
  errorKind?: "infra" | "timeout" | "aborted" | "runtime";
  modelMetrics?: ModelMetrics;
  checks?: unknown[];
  hiddenTests?: { passed?: number; total?: number };
};

type RunFile = {
  timestamp?: string;
  runtime?: string;
  totalPoints?: number;
  maxPoints?: number;
  modelMetrics?: ModelMetrics;
  results?: ResultScenario[];
};

const RESULTS_DIR = resolve(process.argv[2] ?? "results");

function readRunFile(path: string): RunFile {
  return JSON.parse(readFileSync(path, "utf8")) as RunFile;
}

function fileTimestampMs(fileName: string, runFile: RunFile): number {
  const fromName = Number.parseInt(basename(fileName).split("-")[0] ?? "", 10);
  if (Number.isFinite(fromName)) return fromName;

  const fromJson = runFile.timestamp ? Date.parse(runFile.timestamp) : NaN;
  if (Number.isFinite(fromJson)) return fromJson;

  throw new Error(`Cannot determine timestamp for ${fileName}`);
}

function runIdFor(fileName: string): string {
  return basename(fileName, ".json");
}

function statusFor(result: ResultScenario): "pass" | "partial" | "fail" {
  return result.status ?? "fail";
}

function numericOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metaColumns(scenarioId: string): Partial<{
  signal_type: string;
  evaluator_kind: string;
  stacks_json: string;
  task_type: string;
  difficulty: string;
  surface: string;
}> {
  const m: ScenarioMeta | undefined = tryGetMeta(scenarioId);
  if (!m) return {};
  return {
    signal_type: m.signalType,
    evaluator_kind: m.evaluatorKind,
    stacks_json: JSON.stringify(m.stacks),
    task_type: m.taskType,
    difficulty: m.difficulty,
    surface: m.surface,
  };
}

function evaluationFor(result: ResultScenario): string {
  return JSON.stringify({
    status: statusFor(result),
    points: result.points ?? 0,
    maxPoints: result.maxPoints ?? 0,
    checks: result.checks ?? [],
    rubricKind: result.rubricKind ?? "10pt",
    rubricBreakdown: result.rubricBreakdown ?? null,
  });
}

function main(): void {
  runMigrations();

  const files = readdirSync(RESULTS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(RESULTS_DIR, name))
    .toSorted();

  if (files.length === 0) throw new Error(`No result JSON files found in ${RESULTS_DIR}`);

  let scenarioCount = 0;

  withTransaction(() => {
    clearRunData();

    for (const file of files) {
      const runFile = readRunFile(file);
      const results = runFile.results ?? [];
      if (!Array.isArray(results) || results.length === 0) continue;

      const finishedAt = fileTimestampMs(file, runFile);
      const totalWallMs = results.reduce(
        (sum, result) => sum + (numericOrNull(result.wallTimeMs) ?? 0),
        0
      );
      const startedAt = Math.max(0, finishedAt - totalWallMs);
      const runId = runIdFor(file);
      const model =
        runFile.modelMetrics?.model ??
        results.find((r) => r.modelMetrics?.model)?.modelMetrics?.model ??
        "unknown";
      const scenarioIds = results.map((result) => result.scenarioId);

      insertRun({
        id: runId,
        started_at: startedAt,
        status: "running",
        scenario_ids: JSON.stringify(scenarioIds),
        runtime: runFile.runtime ?? "local",
        runtime_kind: "llama.cpp",
        endpoint: null,
        model,
        model_file: null,
        quant: null,
        quant_tier: null,
        quant_source: null,
        context_size: null,
        gpu_backend: null,
        gpu_model: null,
        gpu_count: null,
        vram_total_mb: null,
        host_thermal_note: null,
      });

      updateRun(runId, {
        status: "done",
        finished_at: finishedAt,
        total_points: runFile.totalPoints ?? 0,
        max_points: runFile.maxPoints ?? 0,
        report_path: resolve(file),
        error: null,
      });

      let scenarioStartedAt = startedAt;
      for (const result of results) {
        const wallTimeMs = numericOrNull(result.wallTimeMs);
        const scenarioFinishedAt =
          wallTimeMs === null ? scenarioStartedAt : scenarioStartedAt + wallTimeMs;
        const breakdown = result.rubricBreakdown ?? null;

        upsertScenarioRun({
          run_id: runId,
          scenario_id: result.scenarioId,
          category: stringOrNull(result.category),
          family: result.family ?? "regex-style",
          started_at: scenarioStartedAt,
          finished_at: scenarioFinishedAt,
          status: statusFor(result),
          points: result.points ?? 0,
          max_points: result.maxPoints ?? 0,
          rubric_kind: result.rubricKind ?? "10pt",
          correctness: breakdown?.correctness ?? null,
          scope: breakdown?.scope ?? null,
          pattern: breakdown?.pattern ?? null,
          verification: breakdown?.verification ?? null,
          cleanup: breakdown?.cleanup ?? null,
          wall_time_ms: wallTimeMs,
          first_token_ms: numericOrNull(result.firstTokenMs),
          tool_call_count: numericOrNull(result.toolCallCount),
          model_metrics_json: result.modelMetrics ? JSON.stringify(result.modelMetrics) : null,
          evaluation_json: evaluationFor(result),
          error_kind: result.errorKind ?? null,
          error: stringOrNull(result.error),
          hidden_test_passed: numericOrNull(result.hiddenTests?.passed),
          hidden_test_total: numericOrNull(result.hiddenTests?.total),
          ...metaColumns(result.scenarioId),
        });

        scenarioStartedAt = scenarioFinishedAt;
        scenarioCount += 1;
      }
    }
  });

  console.log(`Replayed ${files.length} result files into scaffold-bench.db`);
  console.log(`Inserted ${scenarioCount} scenario rows`);
  closeDb();
}

main();
