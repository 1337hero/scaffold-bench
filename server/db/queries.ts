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
  runtime: string;
  model: string | null;
  endpoint: string | null;
  system_prompt_hash: string | null;
  scenario_ids: string;
  total_points: number | null;
  max_points: number | null;
  report_path: string | null;
  error: string | null;
}

export interface ScenarioRunRow {
  run_id: string;
  scenario_id: string;
  category: string | null;
  started_at: number | null;
  finished_at: number | null;
  status: "pending" | "running" | "pass" | "partial" | "fail" | "stopped" | null;
  points: number | null;
  max_points: number | null;
  wall_time_ms: number | null;
  first_token_ms: number | null;
  tool_call_count: number | null;
  model_metrics_json: string | null;
  evaluation_json: string | null;
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
    `INSERT INTO runs (id, started_at, status, runtime, model, endpoint, system_prompt_hash, scenario_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.started_at,
      run.status,
      run.runtime,
      run.model,
      run.endpoint,
      run.system_prompt_hash,
      run.scenario_ids,
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
    `INSERT INTO scenario_runs (run_id, scenario_id, category, started_at, finished_at, status, points, max_points, wall_time_ms, first_token_ms, tool_call_count, model_metrics_json, evaluation_json, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id, scenario_id) DO UPDATE SET
       category = COALESCE(excluded.category, category),
       started_at = COALESCE(excluded.started_at, started_at),
       finished_at = COALESCE(excluded.finished_at, finished_at),
       status = COALESCE(excluded.status, status),
       points = COALESCE(excluded.points, points),
       max_points = COALESCE(excluded.max_points, max_points),
       wall_time_ms = COALESCE(excluded.wall_time_ms, wall_time_ms),
       first_token_ms = COALESCE(excluded.first_token_ms, first_token_ms),
       tool_call_count = COALESCE(excluded.tool_call_count, tool_call_count),
       model_metrics_json = COALESCE(excluded.model_metrics_json, model_metrics_json),
       evaluation_json = COALESCE(excluded.evaluation_json, evaluation_json),
       error = COALESCE(excluded.error, error)`,
    [
      row.run_id,
      row.scenario_id,
      row.category ?? null,
      row.started_at ?? null,
      row.finished_at ?? null,
      row.status ?? null,
      row.points ?? null,
      row.max_points ?? null,
      row.wall_time_ms ?? null,
      row.first_token_ms ?? null,
      row.tool_call_count ?? null,
      row.model_metrics_json ?? null,
      row.evaluation_json ?? null,
      row.error ?? null,
    ]
  );
}

export function insertEvent(event: RunEventRow): void {
  const db = getDb();
  db.run(
    `INSERT INTO run_events (run_id, scenario_id, seq, ts, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.run_id,
      event.scenario_id,
      event.seq,
      event.ts,
      event.type,
      event.payload_json,
    ]
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
  fromSeq = 0
): RunEventRow[] {
  const db = getDb();
  return db
    .query<RunEventRow, [string, string, number]>(
      "SELECT * FROM run_events WHERE run_id = ? AND scenario_id = ? AND seq >= ? ORDER BY seq ASC"
    )
    .all(runId, scenarioId, fromSeq);
}

export function getRunEvents(runId: string, fromSeq = 0): RunEventRow[] {
  const db = getDb();
  return db
    .query<RunEventRow, [string, number]>(
      "SELECT * FROM run_events WHERE run_id = ? AND seq >= ? ORDER BY seq ASC"
    )
    .all(runId, fromSeq);
}

export function clearRunData(): void {
  const db = getDb();
  withTransaction(() => {
    db.run("DELETE FROM run_events");
    db.run("DELETE FROM scenario_runs");
    db.run("DELETE FROM runs");
  });
}
