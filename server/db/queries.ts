import { getDb } from "./migrations.ts";

export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn)();
}

export interface RunRow {
  id: string;
  started_at: number;
  finished_at: number | null;
  status: "running" | "done" | "failed" | "stopped";

  scenario_ids: string;

  runtime: string;
  runtime_kind: string;
  endpoint: string | null;
  model: string;
  model_file: string | null;
  quant: string | null;
  quant_tier: number | null;
  quant_source: string | null;
  context_size: number | null;

  gpu_backend: string | null;
  gpu_model: string | null;
  gpu_count: number | null;
  vram_total_mb: number | null;
  host_thermal_note: string | null;

  total_points: number | null;
  max_points: number | null;
  report_path: string | null;
  error: string | null;
}

export interface ScenarioRunRow {
  run_id: string;
  scenario_id: string;
  category: string | null;
  family: string;
  started_at: number | null;
  finished_at: number | null;
  status: "pending" | "running" | "pass" | "partial" | "fail" | "stopped" | null;
  points: number | null;
  max_points: number | null;
  rubric_kind: string;
  correctness: number | null;
  scope: number | null;
  pattern: number | null;
  verification: number | null;
  cleanup: number | null;
  wall_time_ms: number | null;
  first_token_ms: number | null;
  tool_call_count: number | null;
  model_metrics_json: string | null;
  evaluation_json: string | null;
  error_kind: "infra" | "timeout" | "aborted" | "runtime" | null;
  error: string | null;
}

export interface RunEventRow {
  run_id: string;
  scenario_id: string | null;
  seq: number;
  ts: number;
  type: string;
  payload_json: string;
}

export function insertRun(
  run: Omit<RunRow, "finished_at" | "total_points" | "max_points" | "report_path" | "error">
): void {
  const db = getDb();
  db.run(
    `INSERT INTO runs (
      id, started_at, status, scenario_ids,
      runtime, runtime_kind, endpoint, model, model_file, quant, quant_tier, quant_source, context_size,
      gpu_backend, gpu_model, gpu_count, vram_total_mb, host_thermal_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.started_at,
      run.status,
      run.scenario_ids,
      run.runtime,
      run.runtime_kind,
      run.endpoint,
      run.model,
      run.model_file,
      run.quant,
      run.quant_tier,
      run.quant_source,
      run.context_size,
      run.gpu_backend,
      run.gpu_model,
      run.gpu_count,
      run.vram_total_mb,
      run.host_thermal_note,
    ]
  );
}

export function updateRun(
  id: string,
  updates: Partial<
    Pick<RunRow, "finished_at" | "status" | "total_points" | "max_points" | "report_path" | "error">
  >
): void {
  const db = getDb();
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const setClauses = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v as string | number | null);
  db.run(`UPDATE runs SET ${setClauses} WHERE id = ?`, [...values, id]);
}

export function upsertScenarioRun(
  row: Partial<ScenarioRunRow> & { run_id: string; scenario_id: string }
): void {
  const db = getDb();
  db.run(
    `INSERT INTO scenario_runs (
      run_id, scenario_id, category, family, started_at, finished_at, status,
      points, max_points, rubric_kind,
      correctness, scope, pattern, verification, cleanup,
      wall_time_ms, first_token_ms, tool_call_count,
      model_metrics_json, evaluation_json, error_kind, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, scenario_id) DO UPDATE SET
      category = COALESCE(excluded.category, category),
      family = COALESCE(excluded.family, family),
      started_at = COALESCE(excluded.started_at, started_at),
      finished_at = COALESCE(excluded.finished_at, finished_at),
      status = COALESCE(excluded.status, status),
      points = COALESCE(excluded.points, points),
      max_points = COALESCE(excluded.max_points, max_points),
      rubric_kind = COALESCE(excluded.rubric_kind, rubric_kind),
      correctness = COALESCE(excluded.correctness, correctness),
      scope = COALESCE(excluded.scope, scope),
      pattern = COALESCE(excluded.pattern, pattern),
      verification = COALESCE(excluded.verification, verification),
      cleanup = COALESCE(excluded.cleanup, cleanup),
      wall_time_ms = COALESCE(excluded.wall_time_ms, wall_time_ms),
      first_token_ms = COALESCE(excluded.first_token_ms, first_token_ms),
      tool_call_count = COALESCE(excluded.tool_call_count, tool_call_count),
      model_metrics_json = COALESCE(excluded.model_metrics_json, model_metrics_json),
      evaluation_json = COALESCE(excluded.evaluation_json, evaluation_json),
      error_kind = COALESCE(excluded.error_kind, error_kind),
      error = COALESCE(excluded.error, error)`,
    [
      row.run_id,
      row.scenario_id,
      row.category ?? null,
      row.family ?? "regex-style",
      row.started_at ?? null,
      row.finished_at ?? null,
      row.status ?? null,
      row.points ?? null,
      row.max_points ?? null,
      row.rubric_kind ?? "10pt",
      row.correctness ?? null,
      row.scope ?? null,
      row.pattern ?? null,
      row.verification ?? null,
      row.cleanup ?? null,
      row.wall_time_ms ?? null,
      row.first_token_ms ?? null,
      row.tool_call_count ?? null,
      row.model_metrics_json ?? null,
      row.evaluation_json ?? null,
      row.error_kind ?? null,
      row.error ?? null,
    ]
  );
}

export function insertEvent(event: RunEventRow): void {
  const db = getDb();
  db.run(
    `INSERT INTO run_events (run_id, scenario_id, seq, ts, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)`,
    [event.run_id, event.scenario_id, event.seq, event.ts, event.type, event.payload_json]
  );
}

export function listRuns(): RunRow[] {
  const db = getDb();
  return db.query<RunRow, []>("SELECT * FROM runs ORDER BY started_at DESC").all();
}

export function getRun(id: string): RunRow | null {
  const db = getDb();
  return db.query<RunRow, [string]>("SELECT * FROM runs WHERE id = ?").get(id);
}

export function getScenarioRuns(runId: string): ScenarioRunRow[] {
  const db = getDb();
  return db
    .query<ScenarioRunRow, [string]>("SELECT * FROM scenario_runs WHERE run_id = ?")
    .all(runId);
}

export function getScenarioEvents(
  runId: string,
  scenarioId: string,
  fromSeq = 0,
  limit?: number
): RunEventRow[] {
  const db = getDb();
  if (limit === undefined) {
    return db
      .query<
        RunEventRow,
        [string, string, number]
      >("SELECT * FROM run_events WHERE run_id = ? AND scenario_id = ? AND seq >= ? ORDER BY seq ASC")
      .all(runId, scenarioId, fromSeq);
  }

  return db
    .query<
      RunEventRow,
      [string, string, number, number]
    >("SELECT * FROM run_events WHERE run_id = ? AND scenario_id = ? AND seq >= ? ORDER BY seq ASC LIMIT ?")
    .all(runId, scenarioId, fromSeq, limit);
}

export function getRunEvents(runId: string, fromSeq = 0, limit?: number): RunEventRow[] {
  const db = getDb();
  if (limit === undefined) {
    return db
      .query<
        RunEventRow,
        [string, number]
      >("SELECT * FROM run_events WHERE run_id = ? AND seq >= ? ORDER BY seq ASC")
      .all(runId, fromSeq);
  }

  return db
    .query<
      RunEventRow,
      [string, number, number]
    >("SELECT * FROM run_events WHERE run_id = ? AND seq >= ? ORDER BY seq ASC LIMIT ?")
    .all(runId, fromSeq, limit);
}

export function clearRunData(): void {
  const db = getDb();
  withTransaction(() => {
    db.run("DELETE FROM run_events");
    db.run("DELETE FROM scenario_runs");
    db.run("DELETE FROM runs");
  });
}
